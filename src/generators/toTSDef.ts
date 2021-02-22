import { writeFileSync } from 'fs';
import {
    TSRecordEncoding,
    TSEnumEncoding,
    TSVoidEncoding,
    TSNumberEncoding,
    TSPrimitiveEncoding,
    TSTransformingEncoding,
    TSStringEncoding,
    TSEncoding,
} from '../encodings/ts';
import { Block } from '../helpers';
import { EnumSchema, NumberSchema, RecordSchema, S, Schema, StringSchema, VoidSchema } from '..';

type OutFileState = {
    imports: { [module: string]: Set<string> };
    defs: { [name: string]: Block };
    todo: { [name: string]: TSRecordEncoding | TSEnumEncoding };
    outFile: string;
};

type SubEncoding =
    | TSEncoding
    | ((def: TSDef<TSRecordEncoding | TSEnumEncoding>) => (s: Schema) => TSEncoding);

export class TSDef<ME extends TSRecordEncoding | TSEnumEncoding> {
    imports: { [module: string]: Set<string> };
    defs: { [name: string]: TSRecordEncoding | TSEnumEncoding };
    mainEncoding?: ME;
    outFile: string;

    constructor(outFile: string) {
        this.outFile = outFile;
        this.imports = {};
        this.defs = {};
    }

    static fromRecord(
        schema: RecordSchema,
        encodings: {
            [field: string]: SubEncoding;
        },
    ) {
        const def = new TSDef<TSRecordEncoding>(schema.name + '.tsDef.ts');
        def.mainEncoding = def.Record(encodings)(schema);
        return def;
    }

    static fromEnum(
        schema: EnumSchema,
        tag: string | undefined,
        encodings?: (undefined | SubEncoding)[],
    ) {
        const def = new TSDef<TSEnumEncoding>(schema.name + '.tsDef.ts');
        def.mainEncoding = def.Enum(tag, encodings)(schema);
        return def;
    }

    Void(prefer?: 'undefined' | 'null') {
        return (s: Schema): TSVoidEncoding => ({
            ...(s as VoidSchema),
            prefer: prefer || 'undefined',
        });
    }

    Number(useBigInt?: boolean) {
        return (s: Schema): TSNumberEncoding => ({
            ...(s as NumberSchema),
            useBigInt: useBigInt || false,
        });
    }

    String() {
        return (s: Schema) => {
            if ((s as StringSchema).representation !== 'utf16')
                throw new Error('TS only supports encoding utf16 strings');
            else return s as TSStringEncoding;
        };
    }

    Record(encodings?: { [field: string]: SubEncoding }) {
        return (s: Schema): TSRecordEncoding => {
            const r = s as RecordSchema;
            const encoding = {
                ...r,
                encodings: new Map(
                    r.fields.map(([field, fieldSchema]) => {
                        let encoding: TSEncoding;
                        const provided = encodings?.[field];
                        if (provided) {
                            if (typeof provided === 'function') {
                                encoding = provided(this)(fieldSchema);
                            } else {
                                encoding = provided;
                            }
                        } else {
                            encoding = this.defaultEncoding(fieldSchema);
                        }
                        return [field, encoding];
                    }),
                ),
                definedIn: this.outFile,
            };
            this.defs[encoding.name] = encoding;
            return encoding;
        };
    }

    Enum(tag?: string, encodings?: (undefined | SubEncoding)[]) {
        return (s: Schema): TSEnumEncoding => {
            const e = s as EnumSchema;

            const encoding = {
                ...e,
                tag: tag || '_type',
                encodings: e.alternatives.map((altSchema, i) => {
                    let encoding: TSEncoding;
                    const provided = encodings?.[i];
                    if (provided) {
                        if (typeof provided === 'function') {
                            encoding = provided(this)(altSchema);
                        } else {
                            encoding = provided;
                        }
                    } else {
                        encoding = this.defaultEncoding(altSchema);
                    }
                    return encoding;
                }),
                definedIn: this.outFile,
            };
            this.defs[encoding.name] = encoding;
            return encoding;
        };
    }

    Transforming(
        baseEncoding: TSEncoding,
        definedIn: string,
        typeSymbol: string,
        fromBaseSymbol: string,
        toBaseSymbol: string,
    ) {
        return (s: Schema): TSTransformingEncoding => {
            if (baseEncoding.type !== s.type)
                throw new Error(
                    `Transforming encoding ${baseEncoding.type} does not suit to expected schema ${s.type}`,
                );

            if (!this.imports[definedIn]) this.imports[definedIn] = new Set();
            this.imports[definedIn].add(typeSymbol).add(fromBaseSymbol).add(toBaseSymbol);

            return {
                type: 'tsTransforming',
                baseEncoding,
                definedIn,
                typeSymbol,
                fromBaseSymbol,
                toBaseSymbol,
            };
        };
    }

    defaultEncoding(schema: Schema): TSEncoding {
        if (schema.type === 'boolean' || schema.type === 'data' || schema.type === 'unknownEnum') {
            return schema;
        } else if (schema.type === 'void') {
            return { ...schema, prefer: 'undefined' };
        } else if (schema.type === 'number') {
            return { ...schema, useBigInt: false };
        } else if (schema.type === 'string') {
            if (schema.representation !== 'utf16')
                throw new Error('TSEncoding only supports UTF16 strings');
            return schema as TSStringEncoding;
        } else if (schema.type === 'record') {
            return this.Record()(schema);
        } else if (schema.type === 'enum') {
            return this.Enum()(schema);
        } else {
            throw new Error(`Unsupported schema ${(schema as any).type} for default encoding`);
        }
    }

    write(): ME {
        if (!this.mainEncoding) throw new Error('No main encoding');

        const imports = Object.entries(this.imports).map(
            ([module, imps]) => `import { ${[...imps].join(', ')} } from '${module}';`,
        );

        const defs = Object.entries(this.defs)
            .map(([name, def]) =>
                Block.prefix(
                    `export type ${name} = `,
                    Block.suffix(
                        def.type === 'record' ? recordToTSBlock(def) : enumToTSBlock(def),
                        ';',
                    ),
                ),
            )
            .join('\n\n');

        const file =
            '/* THIS FILE IS AUTO-GENERATED BY TYPAC */\n' +
            (imports.length > 0 ? `${imports}\n\n${defs}` : defs);

        writeFileSync(this.outFile, file);

        return this.mainEncoding;
    }
}

function primitiveToTSString(enc: TSPrimitiveEncoding): string {
    return enc.type === 'void'
        ? enc.prefer
        : enc.type === 'boolean'
        ? 'boolean'
        : enc.type === 'number'
        ? enc.useBigInt
            ? 'bigint'
            : 'number'
        : enc.type === 'string'
        ? 'string'
        : enc.type === 'data'
        ? 'Uint8Array'
        : enc.type === 'unknownEnum'
        ? '{}'
        : `UNKNOWN PRIMITIVE TYPE ${(enc as any).type}`;
}

function recordToTSBlock(enc: TSRecordEncoding) {
    return Block.joining(
        '{',
        enc.fields.map(([name, fieldSchema]) => {
            let fieldEnc = enc.encodings.get(name)!;

            if (fieldEnc.type === 'record' || fieldEnc.type === 'enum') {
                return Block.line(`${name}: ${fieldEnc.name}`);
            } else if (fieldEnc.type === 'tsTransforming') {
                return Block.line(`${name}: ${fieldEnc.typeSymbol}`);
            } else {
                return Block.line(`${name}: ${primitiveToTSString(fieldEnc)}`);
            }
        }),
        ',',
        '}',
    );
}

function enumToTSBlock(enc: TSEnumEncoding) {
    return new Block(
        '',
        enc.alternatives.map((altSchema, i) => {
            let altEnc = enc.encodings[i];
            if (enc.tag && altEnc.type === 'record') {
                return Block.line(
                    `| { ${enc.tag}: '${enc.alternativeNames?.[i] || i}' } & ${altEnc.name}`,
                );
            } else if (altEnc.type === 'record' || altEnc.type === 'enum') {
                return Block.line('| ' + altEnc.name);
            } else if (altEnc.type === 'tsTransforming') {
                return Block.line('| ' + altEnc.typeSymbol);
            } else {
                return Block.line('| ' + primitiveToTSString(altEnc));
            }
        }),
    );
}
