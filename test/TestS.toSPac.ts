import { varint, Offset, textDecoder } from 'runtime';
import { TestS } from './TestS.tsDef';
import { dataToB58 } from 'b58';

export function binaryToTestS(buffer: Uint8Array, offset: Offset): {value: TestS, offset: Offset} {
    let testS: TestS;
    // TestS
    const testS_length = varint.decode(buffer, offset.asByteOffset().bytes);
    offset = offset.addBytes(varint.decode.bytes);
    const testS_afterLengthTag = offset;
    // TestS.data
    const testS_TestS__data_inner_length = varint.decode(buffer, offset.asByteOffset().bytes);
    offset = offset.addBytes(varint.decode.bytes);
    const testS_TestS__data_inner = buffer.slice(offset.bytes, offset.bytes + testS_TestS__data_inner_length);
    offset = offset.addBytes(testS_TestS__data_inner_length);
    const testS_TestS__data = dataToB58(testS_TestS__data_inner)
    const testS_TestS: TestS = {
        data: testS_TestS__data
    };
    testS = testS_TestS;
    offset = testS_afterLengthTag.addBytes(testS_length);
    return {value: testS, offset};
}