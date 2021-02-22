import { varint, Offset, textDecoder } from 'runtime';
import { DeviceToken, DeviceTokenApple } from './DeviceToken.tsDef';

export function binaryToDeviceToken(buffer: Uint8Array, offset: Offset): {value: DeviceToken, offset: Offset} {
    let deviceToken: DeviceToken;
    const deviceToken_tagIdx: 0 = varint.decode(buffer, offset.asByteOffset().bytes);
    offset = offset.addBytes(varint.decode.bytes);
    const deviceToken_length = varint.decode(buffer, offset.asByteOffset().bytes);
    offset = offset.addBytes(varint.decode.bytes);
    if (deviceToken_tagIdx === 0) { // apple
        // DeviceTokenApple
        const _length = varint.decode(buffer, offset.asByteOffset().bytes);
        offset = offset.addBytes(varint.decode.bytes);
        const _afterLengthTag = offset;
        // DeviceTokenApple.token
        const _DeviceTokenApple__token_data_length = varint.decode(buffer, offset.asByteOffset().bytes);
        offset = offset.addBytes(varint.decode.bytes);
        const _DeviceTokenApple__token_data = buffer.slice(offset.bytes, offset.bytes + _DeviceTokenApple__token_data_length);
        offset = offset.addBytes(_DeviceTokenApple__token_data_length);
        const _DeviceTokenApple__token = textDecoder.decode(_DeviceTokenApple__token_data)
        const _DeviceTokenApple: DeviceTokenApple = {
            token: _DeviceTokenApple__token
        };
        deviceToken = _DeviceTokenApple;
        offset = _afterLengthTag.addBytes(_length);
        deviceToken['service'] = 'apple';
    }
    return {value: deviceToken, offset};
}