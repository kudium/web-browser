/** @jest-environment node */
import { todoLinks } from '../browser/todoLinks';
test('recognizes labeled web, email and phone actions in order', () => {
  expect(todoLinks('My Email : samsoin@kfna.com; Mobile: +1 (416) 555-0123; Website: https://example.com/hello')).toEqual([
    {href:'mailto:samsoin@kfna.com',label:'My Email',kind:'email'},
    {href:'tel:+14165550123',label:'Mobile',kind:'phone'},
    {href:'https://example.com/hello',label:'Website',kind:'web'},
  ]);
});
test('keeps Markdown labels and deduplicates repeated destinations', () => {
  expect(todoLinks('[My inbox](https://mail.example.com) https://mail.example.com. [My Email](mailto:me@example.com)')).toEqual([
    {href:'https://mail.example.com/',label:'My inbox',kind:'web'},
    {href:'mailto:me@example.com',label:'My Email',kind:'email'},
  ]);
  expect(todoLinks('WWW.example.com')).toEqual([{href:'https://www.example.com/',label:'example.com',kind:'web'}]);
});
test('ignores unsafe destinations, calendar dates and short numbers', () => {
  expect(todoLinks('[Run](javascript:alert) [File](file:///tmp/private) https://user:password@example.com 2026-11-26 1234567')).toEqual([]);
  expect(todoLinks('[Email](mailto:me@example.com?subject=%0D%0AInjected)')).toEqual([]);
});
test('recognizes explicit phone links and plain full-length numbers', () => {
  expect(todoLinks('Call: 4165550123')).toEqual([{href:'tel:4165550123',label:'Call',kind:'phone'}]);
  expect(todoLinks('[Office](tel:+14165550123)')).toEqual([{href:'tel:+14165550123',label:'Office',kind:'phone'}]);
});
