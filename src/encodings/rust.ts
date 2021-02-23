import { BooleanSchema, DataSchema, UnknownEnumSchema, VoidSchema } from '..';

export type RustPrimitiveEncoding =
    | VoidSchema
    | BooleanSchema
    | RustNumberEncoding
    | RustStringEncoding
    | DataSchema
    | UnknownEnumSchema;

export type RustEncoding = RustPrimitiveEncoding | RustRecordEncoding | RustEnumEncoding;
