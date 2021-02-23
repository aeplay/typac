import { S } from '../..';
import {
    SPacEncoding,
    SPacEnumEncoding,
    SPacNumberEncoding,
    SPacRecordEncoding,
    SPacStringEncoding,
} from '../../encodings/spac';
import {
    TSEncoding,
    TSEnumEncoding,
    TSNumberEncoding,
    TSRecordEncoding,
    TSStringEncoding,
    TSTransformingEncoding,
} from '../../encodings/ts';
import { Block } from '../../helpers';

type OutFileState = {
    outFile: string;
    imports: {
        [module: string]: Set<string>;
    };
};

export function encoderPart(
    tsEnc: TSEncoding,
    spacEnc: SPacEncoding,
    valueSource: string,
    outFileState: OutFileState,
): Block[] {
    if (tsEnc.type === 'void' && spacEnc.type === 'void') {
        return voidEncoderPart();
    } else if (tsEnc.type === 'boolean' && spacEnc.type === 'boolean') {
        return booleanEncoderPart(valueSource);
    } else if (tsEnc.type === 'number' && spacEnc.type === 'number') {
        return numberEncoderPart(tsEnc, spacEnc, valueSource);
    } else if (tsEnc.type === 'string' && spacEnc.type === 'string') {
        return stringEncoderPart(tsEnc, spacEnc, valueSource);
    } else if (tsEnc.type === 'data' && spacEnc.type === 'data') {
        return dataEncoderPart(valueSource);
    } else if (tsEnc.type === 'unknownEnum' && spacEnc.type === 'unknownEnum') {
        return unknownEnumEncoderPart();
    } else if (tsEnc.type === 'record' && spacEnc.type === 'record') {
        return recordEncoderPart(tsEnc, spacEnc, valueSource, outFileState);
    } else if (tsEnc.type === 'enum' && spacEnc.type === 'enum') {
        return enumEncoderPart(tsEnc, spacEnc, valueSource, outFileState);
    } else if (tsEnc.type === 'tsTransforming') {
        return transformingEncoderPart(tsEnc, spacEnc, valueSource, outFileState);
    } else {
        throw new Error(`Unsupported combination ${tsEnc.type} <-> ${spacEnc.type}`);
    }
}

function voidEncoderPart() {
    return [];
}

function booleanEncoderPart(valueSource: string) {
    return [
        Block.line(`if (${valueSource}) buffer[offset.bytes] |= 1 << offset.bits;`),
        Block.line(`else buffer[offset.bytes] &= ~(1 << offset.bits);`),
        Block.line(`offset = offset.addBit();`),
    ];
}

function numberEncoderPart(
    tsEnc: TSNumberEncoding,
    spacEnc: SPacNumberEncoding,
    valueSource: string,
) {
    if (tsEnc.useBigInt) throw new Error('Encoding of BigInts not supported yet');
    if (tsEnc.representation === 'integer' && spacEnc.binaryRepresentation === 'varuint') {
        return [
            Block.line(
                `if (${valueSource} < 0 || ${valueSource} > Number.MAX_SAFE_INTEGER) throw new RangeError('Number out of range for unsigned int.')`,
            ),
            Block.line(`varint.encode(${valueSource}, buffer as any, offset.asByteOffset().bytes)`),
            Block.line(`offset = offset.addBytes(varint.encode.bytes);`),
        ];
    } else if (tsEnc.representation === 'integer' && spacEnc.binaryRepresentation === 'varsint') {
        return [
            Block.line(
                `${valueSource} < MIN_SAFE_SIGNED_INTEGER || ${valueSource} > MAX_SAFE_SIGNED_INTEGER) throw new RangeError('Number out of range for signed int.')`,
            ),
            Block.line(
                `varint.encode(sintToUint(${valueSource}), buffer as any, offset.asByteOffset().bytes);`,
            ),
            Block.line(`offset = offset.addBytes(varint.encode.bytes);`),
        ];
    } else {
        throw new Error(
            `Unsupported number encoding ${tsEnc.representation}, ${spacEnc.binaryRepresentation}`,
        );
    }
}

function varuintEncoderPart(valueSource: string) {
    return numberEncoderPart(
        { type: 'number', representation: 'integer', useBigInt: false },
        { type: 'number', representation: 'integer', binaryRepresentation: 'varuint' },
        valueSource,
    );
}

function stringEncoderPart(
    tsEnc: TSStringEncoding,
    spacEnc: SPacStringEncoding,
    valueSource: string,
) {
    if (tsEnc.representation === 'utf16' && spacEnc.representation === 'utf16') {
        return dataEncoderPart(`textEncoder.encode(${valueSource} as string)`);
    } else {
        throw new Error(
            `Unsupported string encoding ${tsEnc.representation}, ${spacEnc.representation}`,
        );
    }
}

function dataEncoderPart(valueSource: string) {
    return [...varuintEncoderPart(valueSource + '.length'), Block.line(`buffer.set(b, offset)`)];
}

function unknownEnumEncoderPart(): Block[] {
    throw new Error('Encoding unknown enum values not supported yet');
}

function recordEncoderPart(
    tsEnc: TSRecordEncoding,
    spacEnc: SPacRecordEncoding,
    valueSource: string,
    outFileState: OutFileState,
) {
    const fieldsLength = recordLengthPredictor(tsEnc, spacEnc, valueSource, false);

    return [
        ...varuintEncoderPart(fieldsLength),
        ...tsEnc.fields.flatMap(([field]) =>
            encoderPart(
                tsEnc.encodings.get(field)!,
                spacEnc.encodings.get(field)!,
                valueSource + '.' + field,
                outFileState,
            ),
        ),
    ];
}

function enumEncoderPart(
    tsEnc: TSEnumEncoding,
    spacEnc: SPacEnumEncoding,
    valueSource: string,
    outFileState: OutFileState,
) {
    return Block.joining(
        '',
        tsEnc.alternatives.map(
            (_altSchema, i) =>
                new Block(
                    `if (${valueSource}.${tsEnc.tag || '_type'} === '${
                        tsEnc.alternativeNames?.[i] || i + ''
                    }') {`,
                    tsEnc.encodings[i].type === 'record' && spacEnc.encodings[i].type === 'record'
                        ? recordEncoderPart(
                              tsEnc.encodings[i] as TSRecordEncoding,
                              spacEnc.encodings[i] as SPacRecordEncoding,
                              valueSource,
                              outFileState,
                          )
                        : [
                              ...varuintEncoderPart(
                                  lengthPredictor(
                                      tsEnc.encodings[i],
                                      spacEnc.encodings[i],
                                      valueSource,
                                  ),
                              ),
                              ...encoderPart(
                                  tsEnc.encodings[i],
                                  spacEnc.encodings[i],
                                  valueSource,
                                  outFileState,
                              ),
                          ],
                    '}',
                ),
        ),
        ' else ',
    ).body!;
}

function transformingEncoderPart(
    tsEnc: TSTransformingEncoding,
    spacEnc: SPacEncoding,
    valueSource: string,
    outFileState: OutFileState,
) {
    if (!outFileState.imports[tsEnc.definedIn]) outFileState.imports[tsEnc.definedIn] = new Set();
    outFileState.imports[tsEnc.definedIn].add(tsEnc.toBaseSymbol);

    if (tsEnc.baseEncoding.type !== spacEnc.type)
        throw new Error(
            `Incompatible transforming encoding and SPac encoding ${tsEnc.typeSymbol}(${tsEnc.baseEncoding}) <-> ${spacEnc.type}`,
        );

    return encoderPart(
        tsEnc.baseEncoding,
        spacEnc,
        `${tsEnc.toBaseSymbol}(${valueSource})`,
        outFileState,
    );
}

function lengthPredictor(tsEnc: TSEncoding, spacEnc: SPacEncoding, valueSource: string): string {
    if (tsEnc.type === 'void' && spacEnc.type === 'void') {
        return `(new Offset(0))`;
    } else if (tsEnc.type === 'boolean' && spacEnc.type === 'boolean') {
        return `new Offset(0, 1)`;
    } else if (tsEnc.type === 'number' && spacEnc.type === 'number') {
        return numberLengthPredictor(tsEnc, spacEnc, valueSource);
    } else if (tsEnc.type === 'string' && spacEnc.type === 'string') {
        return stringLengthPredictor(tsEnc, spacEnc, valueSource);
    } else if (tsEnc.type === 'data' && spacEnc.type === 'data') {
        return dataLengthPredictor(valueSource);
    } else if (tsEnc.type === 'unknownEnum' && spacEnc.type === 'unknownEnum') {
        return unknownEnumLengthPredictor(valueSource);
    } else if (tsEnc.type === 'record' && spacEnc.type === 'record') {
        return recordLengthPredictor(tsEnc, spacEnc, valueSource, true);
    } else if (tsEnc.type === 'enum' && spacEnc.type === 'enum') {
        return enumLengthPredictor(tsEnc, spacEnc, valueSource);
    } else if (tsEnc.type === 'tsTransforming') {
        return transformingLengthPredictor(tsEnc, spacEnc, valueSource);
    } else {
        throw new Error(`Unsupported combination ${tsEnc.type} <-> ${spacEnc.type}`);
    }
}

function numberLengthPredictor(
    tsEnc: TSNumberEncoding,
    spacEnc: SPacNumberEncoding,
    valueSource: string,
) {
    if (tsEnc.useBigInt) throw new Error('Encoding of BigInts not supported yet');
    if (tsEnc.representation === 'integer' && spacEnc.binaryRepresentation === 'varuint') {
        return `new Offset(varint.encodingLength(${valueSource}))`;
    } else if (tsEnc.representation === 'integer' && spacEnc.binaryRepresentation === 'varsint') {
        return `new Offset(varint.encodingLength(sintToUint(${valueSource})))`;
    } else {
        throw new Error(
            `Unsupported number encoding ${tsEnc.representation}, ${spacEnc.binaryRepresentation}`,
        );
    }
}

function varuintLengthPredictor(valueSource: string) {
    return numberLengthPredictor(
        { type: 'number', representation: 'integer', useBigInt: false },
        { type: 'number', representation: 'integer', binaryRepresentation: 'varuint' },
        valueSource,
    );
}

function stringLengthPredictor(
    tsEnc: TSStringEncoding,
    spacEnc: SPacStringEncoding,
    valueSource: string,
) {
    if (tsEnc.representation === 'utf16' && spacEnc.representation === 'utf16') {
        return dataLengthPredictor(`textEncoder.encode(${valueSource} as string)`);
    } else {
        throw new Error(
            `Unsupported string encoding ${tsEnc.representation}, ${spacEnc.representation}`,
        );
    }
}

function dataLengthPredictor(valueSource: string) {
    return `${varuintLengthPredictor(valueSource + '.length')}.addBytes(${valueSource}.length)`;
}

function unknownEnumLengthPredictor(valueSource: string): string {
    throw new Error('Encoding unknown enum values not supported yet');
}

function recordLengthPredictor(
    tsEnc: TSRecordEncoding,
    spacEnc: SPacRecordEncoding,
    valueSource: string,
    withLengthTag: boolean,
) {
    const fieldLengths = tsEnc.fields.map(([field]) =>
        lengthPredictor(
            tsEnc.encodings.get(field)!,
            spacEnc.encodings.get(field)!,
            valueSource + '.' + field,
        ),
    );

    if (withLengthTag) {
        return `withLengthTag((${fieldLengths.join('.addBytes(')}))`;
    } else {
        return `(${fieldLengths.join('.addBytes(')})`;
    }
}

function enumLengthPredictor(
    tsEnc: TSEnumEncoding,
    spacEnc: SPacEnumEncoding,
    valueSource: string,
) {
    const alternativeLengths = tsEnc.alternatives.map((altSchema, i) =>
        altSchema.type === 'record'
            ? lengthPredictor(tsEnc.encodings[i], spacEnc.encodings[i], valueSource)
            : `withLengthTag(${lengthPredictor(
                  tsEnc.encodings[i],
                  spacEnc.encodings[i],
                  valueSource,
              )})`,
    );

    return (
        alternativeLengths
            .map(
                (l, i) =>
                    `${valueSource}.${tsEnc.tag || '_type'} === '${
                        tsEnc.alternativeNames?.[i] || i + ''
                    }' ? ` + l,
            )
            .join(' : ') + ' : NaN'
    );
}

function transformingLengthPredictor(
    tsEnc: TSTransformingEncoding,
    spacEnc: SPacEncoding,
    valueSource: string,
) {
    if (tsEnc.baseEncoding.type !== spacEnc.type)
        throw new Error(
            `Incompatible transforming encoding and SPac encoding ${tsEnc.typeSymbol}(${tsEnc.baseEncoding}) <-> ${spacEnc.type}`,
        );

    return lengthPredictor(tsEnc.baseEncoding, spacEnc, `${tsEnc.toBaseSymbol}(${valueSource})`);
}
