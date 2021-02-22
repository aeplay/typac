/* A serial packed binary protocol */
import {
    BooleanSchema,
    DataSchema,
    EnumSchema,
    NumberSchema,
    RecordSchema,
    Schema,
    StringSchema,
    UnknownEnumSchema,
    VoidSchema,
} from '..';

export type SPacNumberEncoding = NumberSchema & {
    representation: 'integer';
    binaryRepresentation: 'varsint' | 'varuint';
};
export type SPacStringEncoding = StringSchema & { representation: 'utf16' };

export type SPacRecordEncoding = RecordSchema & {
    encodings: Map<string, SPacEncoding>;
};
export type SPacEnumEncoding = EnumSchema & {
    encodings: SPacEncoding[];
};

export type SPacEncoding =
    | VoidSchema
    | BooleanSchema
    | SPacNumberEncoding
    | SPacStringEncoding
    | DataSchema
    | UnknownEnumSchema
    | SPacRecordEncoding
    | SPacEnumEncoding;

export const SPacEncode = {
    Number: () => (s: Schema): SPacNumberEncoding => {
        const ns = s as NumberSchema;
        if (ns.representation !== 'integer')
            throw new Error("serial binary encoding doesn't support flaots yet");
        if (ns.rangeMin === undefined || ns.rangeMin < 0) {
            return { ...ns, representation: 'integer', binaryRepresentation: 'varsint' };
        } else {
            return { ...ns, representation: 'integer', binaryRepresentation: 'varuint' };
        }
    },
    String: () => (s: Schema): SPacStringEncoding => {
        if ((s as StringSchema).representation !== 'utf16')
            throw new Error('serial binary encoding only supports UTF-16 strings');
        return s as SPacStringEncoding;
    },
    Record: (encodings?: { [key: string]: (s: Schema) => SPacEncoding }) => (
        s: Schema,
    ): SPacRecordEncoding => ({
        ...(s as RecordSchema),
        encodings: new Map(
            (s as RecordSchema).fields.map(([field, fieldSchema]) => [
                field,
                encodings?.[field](fieldSchema) || defaultSPacEnc(fieldSchema),
            ]),
        ),
    }),
    Enum: (encodings?: (((s: Schema) => SPacEncoding) | undefined)[]) => (
        s: Schema,
    ): SPacEnumEncoding => ({
        ...(s as EnumSchema),
        encodings: (s as EnumSchema).alternatives.map(
            (altSchema, i) => encodings?.[i]?.(altSchema) || defaultSPacEnc(altSchema),
        ),
    }),
};

export function defaultSPacEnc(schema: Schema): SPacEncoding {
    return schema.type === 'void' ||
        schema.type === 'boolean' ||
        schema.type === 'data' ||
        schema.type === 'unknownEnum'
        ? schema
        : schema.type === 'number'
        ? SPacEncode.Number()(schema)
        : schema.type === 'string'
        ? SPacEncode.String()(schema)
        : schema.type === 'record'
        ? SPacEncode.Record()(schema)
        : SPacEncode.Enum()(schema);
}
