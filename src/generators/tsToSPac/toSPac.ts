import { writeFileSync } from 'fs';
import { S, Schema } from '../..';
import {
    defaultSPacEnc,
    SPacEncoding,
    SPacEnumEncoding,
    SPacNumberEncoding,
    SPacRecordEncoding,
} from '../../encodings/spac';
import {
    TSEncoding,
    TSEnumEncoding,
    TSNumberEncoding,
    TSRecordEncoding,
    TSTransformingEncoding,
    TSVoidEncoding,
} from '../../encodings/ts';
import { Block, relativeImportPath, toFirstLowerCase } from '../../helpers';
import path from 'path';

// to enforce type compatability
export function spacToTs<
    S extends Schema,
    TSE extends S & TSEncoding,
    SPE extends S & SPacEncoding
>(_schema: S, tsEnc: TSE, spacEnc: SPE) {
    if (tsEnc.type === 'enum' || tsEnc.type === 'record') {
        const tsRecordOrEnum = tsEnc as TSRecordEncoding | TSEnumEncoding;
        const outFileState: OutFileState = {
            outFile: path.resolve(tsRecordOrEnum.name + '.toSPac.ts'),
            imports: {},
        };

        const value = toFirstLowerCase(tsRecordOrEnum.name);
        const fn = new Block(
            `export function binaryTo${tsRecordOrEnum.name}(buffer: Uint8Array, offset: Offset): {value: ${tsRecordOrEnum.name}, offset: Offset} {`,
            [
                Block.line(`let ${value}: ${tsRecordOrEnum.name};`),
                ...decoderPart(tsEnc, spacEnc, value, value, outFileState),
                Block.line(`return {value: ${value}, offset};`),
            ],
            '}',
        );

        const file = `import { varint, Offset, textDecoder } from 'runtime';
${Object.entries(outFileState.imports)
    .map(([module, imports]) => `import { ${[...imports].join(', ')} } from '${module}';`)
    .join('\n')}

${fn.toString()}`;

        writeFileSync(outFileState.outFile, file);
    } else {
        throw new Error('Can only write spacToTS encoder for structs and enums');
    }
}

type OutFileState = {
    outFile: string;
    imports: {
        [module: string]: Set<string>;
    };
};

export function decoderPart(
    tsEnc: TSEncoding,
    spacEnc: SPacEncoding,
    valueTarget: string,
    varCtx: string,
    outFileState: OutFileState,
): Block[] {
    if (tsEnc.type === 'void' && spacEnc.type === 'void') {
        return voidDecoderPart(valueTarget, tsEnc);
    } else if (tsEnc.type === 'boolean' && spacEnc.type === 'boolean') {
        return booleanDecoderPart(valueTarget);
    } else if (tsEnc.type === 'number' && spacEnc.type === 'number') {
        return numberDecoderPart(tsEnc, spacEnc, valueTarget, varCtx);
    } else if (tsEnc.type === 'string' && spacEnc.type === 'string') {
        return stringDecoderPart(valueTarget, varCtx);
    } else if (tsEnc.type === 'data' && spacEnc.type === 'data') {
        return dataDecoderPart(valueTarget, varCtx);
    } else if (tsEnc.type === 'unknownEnum' && spacEnc.type === 'unknownEnum') {
        return unknownEnumDecoderPart(valueTarget, varCtx);
    } else if (tsEnc.type === 'record' && spacEnc.type === 'record') {
        return recordDecoderPart(tsEnc, spacEnc, valueTarget, varCtx, outFileState);
    } else if (tsEnc.type === 'enum' && spacEnc.type === 'enum') {
        return enumDecoderPart(tsEnc, spacEnc, valueTarget, varCtx, outFileState);
    } else if (tsEnc.type === 'tsTransforming') {
        return transformingDecoderPart(tsEnc, spacEnc, valueTarget, varCtx, outFileState);
    } else {
        throw new Error(`Unsupported combination ${tsEnc.type} <-> ${spacEnc.type}`);
    }
}

function voidDecoderPart(valueTarget: string, tsEnc: TSVoidEncoding): Block[] {
    return [Block.line(`${valueTarget} = ${tsEnc.prefer};`)];
}

function booleanDecoderPart(valueTarget: string): Block[] {
    return [
        Block.line(`${valueTarget} = !!(buffer[offset.bytes] & (1 << offset.bits));`),
        Block.line(`offset = offset.addBit();`),
    ];
}

function numberDecoderPart(
    tsEnc: TSNumberEncoding,
    spacEnc: SPacNumberEncoding,
    valueTarget: string,
    varCtx: string,
): Block[] {
    if (tsEnc.useBigInt) throw new Error("Can't decode to BigInt yet.");
    if (spacEnc.binaryRepresentation === 'varuint') {
        return [
            Block.line(`${valueTarget} = varint.decode(buffer, offset.asByteOffset().bytes);`),
            Block.line(`offset = offset.addBytes(varint.decode.bytes);`),
        ];
    } else if (spacEnc.binaryRepresentation === 'varsint') {
        const u = varCtx + '_uint';
        return [
            Block.line(`const ${u} = varint.decode(buffer, offset.asByteOffset().bytes);`),
            Block.line(`${valueTarget} = ${u} % 2 === 0 ? ${u} / 2 : (${u} + 1) / -2;`),
            Block.line(`offset = offset.addBytes(varint.decode.bytes);`),
        ];
    } else {
        throw new Error(`Can't decode from ${spacEnc.binaryRepresentation} yet`);
    }
}

function varuintDecoderPart(valueTarget: string, varCtx: string) {
    return numberDecoderPart(
        { type: 'number', representation: 'integer', useBigInt: false },
        { type: 'number', representation: 'integer', binaryRepresentation: 'varuint' },
        valueTarget,
        varCtx,
    );
}

function stringDecoderPart(valueTarget: string, varCtx: string) {
    const data = varCtx + '_data';
    return [
        ...dataDecoderPart('const ' + data, data),
        Block.line(`${valueTarget} = textDecoder.decode(${data})`),
    ];
}

function dataDecoderPart(valueTarget: string, varCtx: string) {
    const length = varCtx + '_length';
    return [
        ...varuintDecoderPart('const ' + length, length),
        Block.line(`${valueTarget} = buffer.slice(offset.bytes, offset.bytes + ${length});`),
        Block.line(`offset = offset.addBytes(${length});`),
    ];
}

function unknownEnumDecoderPart(valueTarget: string, varCtx: string) {
    const tagIdx = varCtx + '_tagIdx';
    const length = varCtx + '_length';
    return [
        Block.line(`${valueTarget} = {};`),
        ...varuintDecoderPart('const ' + tagIdx, tagIdx),
        ...varuintDecoderPart('const ' + length, length),
        Block.line(`offset = offset.addBytes(${length});`),
    ];
}

function recordDecoderPart(
    tsEnc: TSRecordEncoding,
    spacEnc: SPacRecordEncoding,
    valueTarget: string,
    varCtx: string,
    outFileState: OutFileState,
) {
    console.log(tsEnc.name, tsEnc.definedIn);
    const importPath = relativeImportPath(outFileState.outFile, tsEnc.definedIn);
    if (!outFileState.imports[importPath]) outFileState.imports[importPath] = new Set();
    outFileState.imports[importPath].add(tsEnc.name);

    const length = varCtx + '_length';
    const record = varCtx + '_' + tsEnc.name;
    const offsetAfterLengthTag = varCtx + '_afterLengthTag';

    return [
        Block.line(`// ${tsEnc.name}`),
        ...varuintDecoderPart('const ' + length, length),
        Block.line(`const ${offsetAfterLengthTag} = offset;`),
        ...tsEnc.fields.flatMap(([name, fieldSchema]) => [
            Block.line(`// ${tsEnc.name}.${name}`),
            ...decoderPart(
                tsEnc.encodings.get(name)!,
                spacEnc.encodings.get(name)!,
                `const ${record}__${name}`,
                `${record}__${name}`,
                outFileState,
            ),
        ]),
        new Block(
            `const ${record}: ${tsEnc.name} = {`,
            [...tsEnc.fields.map(([name]) => Block.line(`${name}: ${record}__${name}`))],
            '};',
        ),
        Block.line(`${valueTarget} = ${record};`),
        Block.line(`offset = ${offsetAfterLengthTag}.addBytes(${length});`),
    ];
}

function enumDecoderPart(
    tsEnc: TSEnumEncoding,
    spacEnc: SPacEnumEncoding,
    valueTarget: string,
    varCtx: string,
    outFileState: OutFileState,
) {
    const importPath = relativeImportPath(outFileState.outFile, tsEnc.definedIn);
    if (!outFileState.imports[importPath]) outFileState.imports[importPath] = new Set();
    outFileState.imports[importPath].add(tsEnc.name);

    const tagIdx = varCtx + '_tagIdx';
    const afterTagIdx = varCtx + '_afterTagIdx';
    const length = varCtx + '_length';

    return [
        ...varuintDecoderPart(
            'const ' + tagIdx + ': ' + tsEnc.alternatives.map((_, i) => i).join(' | '),
            tagIdx,
        ),
        Block.line(`const ${afterTagIdx} = offset;`),
        ...varuintDecoderPart('const ' + length, length),
        ...(Block.joining(
            '',
            tsEnc.alternatives.map((altSchema, altTagIdx) => {
                const altNameOrIdx = tsEnc.alternativeNames?.[altTagIdx] || altTagIdx + '';
                return new Block(
                    `if (${tagIdx} === ${altTagIdx}) { // ${altNameOrIdx}`,
                    [
                        // for records, reuse the parent enum's length tag as the record's length tag
                        ...(altSchema.type === 'record'
                            ? [Block.line(`offset = ${afterTagIdx}`)]
                            : []),
                        ...decoderPart(
                            tsEnc.encodings[altTagIdx],
                            spacEnc.encodings[altTagIdx],
                            valueTarget,
                            '',
                            outFileState,
                        ),
                        ...(tsEnc.tag
                            ? [Block.line(`${valueTarget}['${tsEnc.tag}'] = '${altNameOrIdx}';`)]
                            : []),
                    ],
                    '}',
                );
            }),
            'else',
        ).body || []),
    ];
}

function transformingDecoderPart(
    tsEnc: TSTransformingEncoding,
    spacEnc: SPacEncoding,
    valueTarget: string,
    varCtx: string,
    outFileState: OutFileState,
) {
    const inBaseEnc = varCtx + '_inner';

    if (!outFileState.imports[tsEnc.definedIn]) outFileState.imports[tsEnc.definedIn] = new Set();
    outFileState.imports[tsEnc.definedIn].add(tsEnc.fromBaseSymbol);

    if (tsEnc.baseEncoding.type !== spacEnc.type)
        throw new Error(
            `Incompatible transforming encoding and SPac encoding ${tsEnc.typeSymbol}(${tsEnc.baseEncoding}) <-> ${spacEnc.type}`,
        );

    return [
        ...decoderPart(tsEnc.baseEncoding, spacEnc, 'const ' + inBaseEnc, inBaseEnc, outFileState),
        Block.line(`${valueTarget} = ${tsEnc.fromBaseSymbol}(${inBaseEnc})`),
    ];
}
