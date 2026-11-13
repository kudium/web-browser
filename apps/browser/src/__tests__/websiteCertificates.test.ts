import { EventEmitter } from 'events';
import type { Session, WebContents } from 'electron';
import {
  allowWebsiteCertificateErrors,
  certificateErrorFor,
} from '../main/websiteCertificates';

it('loads invalid certificates and keeps warnings scoped to the session and origin', () => {
  const session = {} as Session;
  const contents = Object.assign(new EventEmitter(), { session });
  const changed = jest.fn();
  allowWebsiteCertificateErrors(contents as unknown as WebContents, changed);
  const event = { preventDefault: jest.fn() };
  const callback = jest.fn();
  contents.emit(
    'certificate-error',
    event,
    'https://expired.example/path',
    'net::ERR_CERT_DATE_INVALID',
    {},
    callback,
    true
  );
  expect(event.preventDefault).toHaveBeenCalled();
  expect(callback).toHaveBeenCalledWith(true);
  expect(changed).toHaveBeenCalled();
  expect(certificateErrorFor(session, 'https://expired.example')).toBe(
    'net::ERR_CERT_DATE_INVALID'
  );
  expect(certificateErrorFor(session, 'https://valid.example')).toBeUndefined();
  expect(
    certificateErrorFor({} as Session, 'https://expired.example')
  ).toBeUndefined();
});
