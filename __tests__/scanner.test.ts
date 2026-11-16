import {KeyboardScanner, ScannerInputPort} from '../src/device/scanner';

describe('KeyboardScanner framing', () => {
  it('joins chunks, trims frames, and emits CRLF only once across chunks', () => {
    const scanner = new KeyboardScanner();
    const port: ScannerInputPort = scanner;
    const codes: string[] = [];
    port.subscribe(code => codes.push(code));

    scanner.feed('  WOOD-');
    scanner.feed('001  \r');
    scanner.feed('\n\n\t\r\nWOOD-002\nWOOD-003\r');

    expect(codes).toEqual(['WOOD-001', 'WOOD-002', 'WOOD-003']);
  });

  it('discards an overflowed frame until its terminator rather than returning a truncated code', () => {
    const scanner = new KeyboardScanner({maxLength: 5});
    const codes: string[] = [];
    scanner.subscribe(code => codes.push(code));

    scanner.feed('12345');
    scanner.feed('6valid');
    scanner.feed('\r\n12345\n');

    expect(codes).toEqual(['12345']);
  });

  it('drops frames with control characters, including interior tabs', () => {
    const scanner = new KeyboardScanner();
    const codes: string[] = [];
    scanner.subscribe(code => codes.push(code));

    scanner.feed('bad\u0000code\nAB\tCD\nBAD\u007F\rNEXT\n');

    expect(codes).toEqual(['NEXT']);
  });

  it('starts a new frame on reset, retaining subscriptions', () => {
    const scanner = new KeyboardScanner({maxLength: 5});
    const codes: string[] = [];
    scanner.subscribe(code => codes.push(code));
    scanner.feed('123456');
    scanner.reset();
    scanner.feed('NEXT\n');
    scanner.feed('old');
    scanner.reset();
    scanner.feed('new\n');

    expect(codes).toEqual(['NEXT', 'new']);
  });

  it('isolates listener failures and permits unsubscribing without losing later frames', () => {
    const scanner = new KeyboardScanner();
    const codes: string[] = [];
    scanner.subscribe(() => { throw new Error('consumer failed'); });
    const unsubscribe = scanner.subscribe(code => codes.push(code));

    expect(() => scanner.feed('FIRST\nSECOND\n')).not.toThrow();
    unsubscribe();
    unsubscribe();
    scanner.feed('THIRD\n');

    expect(codes).toEqual(['FIRST', 'SECOND']);
  });

  it.each([0, -1, 1.5, NaN, Infinity])('rejects invalid maximum length %s', maxLength => {
    expect(() => new KeyboardScanner({maxLength})).toThrow(/maxLength/);
  });
});
