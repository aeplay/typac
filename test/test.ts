import { S } from '../src';
import { SPacEncode } from '../src/encodings/spac';
import { TSDef } from '../src/generators/toTSDef';
import { spacToTs } from '../src/generators/tsToSPac';

const NotificationSettingsS = S.TaggedEnum('NotificationSettings', {
    V0: S.Record('NotificationSettingsV0', {
        throttleMs: S.UInt,
    }),
});

TSDef.fromEnum(NotificationSettingsS, 'version', [
    (def) => def.Record({ throttleMs: (def) => def.Number(true) }),
]).write();

const DeviceTokenS = S.TaggedEnum('DeviceToken', {
    apple: S.Record('DeviceTokenApple', {
        token: S.String,
    }),
});

const DeviceTokenTSE = TSDef.fromEnum(DeviceTokenS, 'service').write();
const DeviceTokenSPE = SPacEncode.Enum()(DeviceTokenS);

spacToTs(DeviceTokenS, DeviceTokenTSE, DeviceTokenSPE);

const TestS = S.Record('TestS', {
    data: S.Data,
});

const TestTSE = TSDef.fromRecord(TestS, {
    data: (def) => def.Transforming(S.Data, 'b58', 'B58String', 'dataToB58', 'b58ToData'),
}).write();

const TestSPE = SPacEncode.Record()(TestS);

spacToTs(TestS, TestTSE, TestSPE);
