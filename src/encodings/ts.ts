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

export type TSVoidEncoding = VoidSchema & { prefer: 'undefined' | 'null' };
export type TSNumberEncoding = NumberSchema & { useBigInt: boolean };
export type TSStringEncoding = StringSchema & { representation: 'utf16' };
export type TSRecordEncoding = RecordSchema & {
    encodings: Map<string, TSEncoding>;
    definedIn: string;
};
export type TSEnumEncoding = EnumSchema & {
    tag?: string;
    encodings: TSEncoding[];
    definedIn: string;
};

export type TSTransformingEncoding = {
    type: 'tsTransforming';
    baseEncoding: TSEncoding;
    definedIn: string;
    typeSymbol: string;
    toBaseSymbol: string;
    fromBaseSymbol: string;
};

export type TSPrimitiveEncoding =
    | TSVoidEncoding
    | BooleanSchema
    | TSNumberEncoding
    | TSStringEncoding
    | DataSchema
    | UnknownEnumSchema;

export type TSEncoding =
    | TSPrimitiveEncoding
    | TSRecordEncoding
    | TSEnumEncoding
    | TSTransformingEncoding;
