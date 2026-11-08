/** @jest-environment node */
import { parseBrowserPasswords } from '../main/passwordManager/browserPasswords';

test('imports Chrome CSV with quoted, multiline passwords and BOM', () => {
  const result = parseBrowserPasswords('\uFEFFname,url,username,password\r\nExample,https://example.com/login,user,"a,b""c\nnext"\r\n');
  expect(result.items).toEqual([{title:'Example', origin:'https://example.com', username:'user', password:'a,b"c\nnext'}]);
});
test('imports Firefox and Safari column labels', () => {
  expect(parseBrowserPasswords('url,username,password\nhttps://example.com,u,p').items[0].password).toBe('p');
  expect(parseBrowserPasswords('Title,URL,Username,Password\nExample,https://example.com,u,p').items[0].title).toBe('Example');
});
test('skips unsupported origins and empty passwords without returning credentials in errors', () => {
  const result = parseBrowserPasswords('url,username,password\nhttp://example.com,u,secret\nhttps://u:p@example.com,u,secret\nhttps://example.com,u,\nhttps://ok.com,u,good');
  expect(result.skipped).toBe(3); expect(result.items).toHaveLength(1);
  expect(() => parseBrowserPasswords('url,username,password\nhttp://example.com,u,secret')).toThrow('Only HTTPS');
});
test('rejects missing columns, malformed quoting and excessive rows', () => {
  expect(() => parseBrowserPasswords('name,password\nx,y')).toThrow('columns');
  expect(() => parseBrowserPasswords('url,username,password\nhttps://example.com,u,"secret')).toThrow('Invalid password CSV');
  expect(() => parseBrowserPasswords('url,username,password\n'+'https://example.com,u,p\n'.repeat(1001))).toThrow('1,000');
});
