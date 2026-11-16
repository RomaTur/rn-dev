/** Framed input contract for a future Android HID or serial integration. */
export interface ScannerInputPort {
  subscribe(handler: (code: string) => void): () => void;
}

/**
 * Keyboard/manual demonstration adapter; this class does not read hardware.
 * CR and LF terminate frames. Empty frames (including the LF in CRLF) are
 * ignored. An overlong frame or any other control character, including a tab,
 * discards the complete frame through its next terminator.
 */
export class KeyboardScanner implements ScannerInputPort {
  private readonly maxLength: number;
  private readonly listeners = new Set<(code: string) => void>();
  private buffer = '';
  private discarding = false;

  constructor(options: {maxLength?: number} = {}) {
    this.maxLength = options.maxLength ?? 128;
    if (!Number.isSafeInteger(this.maxLength) || this.maxLength < 1) {
      throw new Error('maxLength must be a positive safe integer');
    }
  }

  subscribe(handler: (code: string) => void): () => void {
    this.listeners.add(handler);
    return () => { this.listeners.delete(handler); };
  }

  feed(chunk: string): void {
    for (const character of chunk) {
      if (character === '\r' || character === '\n') {
        const code = this.discarding ? '' : this.buffer.trim();
        this.reset();
        if (code) {
          for (const listener of [...this.listeners]) {
            try {
              listener(code);
            } catch {
              // A consumer failure must not break framing or other consumers.
            }
          }
        }
      } else if (!this.discarding) {
        const characterCode = character.charCodeAt(0);
        if (characterCode <= 31 || (characterCode >= 127 && characterCode <= 159) ||
          this.buffer.length + character.length > this.maxLength) {
          this.buffer = '';
          this.discarding = true;
        } else {
          this.buffer += character;
        }
      }
    }
  }

  reset(): void {
    this.buffer = '';
    this.discarding = false;
  }
}
