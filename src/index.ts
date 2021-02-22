export type VoidSchema = { type: 'void' };
export type BooleanSchema = { type: 'boolean' };

export type NumberSchema = {
    type: 'number';
    rangeMin?: number | '-Infinity';
    rangeMax?: number | 'Infinity';
    representation: 'integer' | 'float';
};

export type StringSchema = {
    type: 'string';
    representation: 'utf8' | 'utf16';
};

export type DataSchema = { type: 'data' };

export type UnknownEnumSchema = { type: 'unknownEnum' };

export type PrimitiveSchema =
    | VoidSchema
    | BooleanSchema
    | NumberSchema
    | StringSchema
    | DataSchema
    | UnknownEnumSchema;

export type RecordSchema = {
    type: 'record';
    name: string;
    fields: [string, Schema][];
    deprecated: string[];
};

export type EnumSchema = {
    type: 'enum';
    name: string;
    alternatives: Schema[];
    alternativeNames?: string[];
    deprecated: number[];
};

export type Schema = PrimitiveSchema | RecordSchema | EnumSchema;

// Schema constructors
export const S = {
    Void: { type: 'void' } as VoidSchema,
    Int: { type: 'number', representation: 'integer' } as NumberSchema,
    UInt: { type: 'number', rangeMax: 0, representation: 'integer' } as NumberSchema,
    String: { type: 'string', representation: 'utf16' } as StringSchema,
    Data: { type: 'data' } as DataSchema,
    Record(name: string, fields: { [name: string]: Schema }): RecordSchema {
        return { type: 'record', name, fields: Object.entries(fields), deprecated: [] };
    },
    Enum(name: string, alternatives: Schema[]): EnumSchema {
        return { type: 'enum', name, alternatives, deprecated: [] };
    },
    TaggedEnum(name: string, alternatives: { [name: string]: Schema }): EnumSchema {
        return {
            type: 'enum',
            name,
            alternatives: Object.values(alternatives),
            alternativeNames: Object.keys(alternatives),
            deprecated: [],
        };
    },
};
