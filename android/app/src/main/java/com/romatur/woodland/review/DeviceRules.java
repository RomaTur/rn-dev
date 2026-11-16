package com.romatur.woodland.review;

import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.text.ParseException;
import java.text.SimpleDateFormat;
import java.util.Arrays;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

/** Platform-independent credential and input rules, also tested on the JVM. */
final class DeviceRules {
  static final int PIN_ITERATIONS = 210000;
  private static final long LOCKOUT_MS = 15 * 60 * 1000;

  static boolean validPhotoName(String value) {
    return value != null && value.matches("photo_[a-f0-9-]{16,64}\\.jpg");
  }

  static boolean validPdfName(String value) {
    return value != null && value.matches("pdf_[a-f0-9-]{16,64}\\.pdf");
  }

  // One SHA-256 block gives a 256-bit PBKDF2 key. HmacSHA256 is available on
  // Android API 24/25 too, unlike SecretKeyFactory's SHA-256 PBKDF2 provider.
  static byte[] derivePin(String pin, byte[] salt, int iterations) throws GeneralSecurityException {
    if (!pin.matches("[0-9]{6}") || salt.length < 16 || iterations < 1) {
      throw new IllegalArgumentException("Invalid credential input");
    }
    byte[] password = pin.getBytes(StandardCharsets.US_ASCII);
    try {
      Mac mac = Mac.getInstance("HmacSHA256");
      mac.init(new SecretKeySpec(password, "HmacSHA256"));
      byte[] block = Arrays.copyOf(salt, salt.length + 4);
      block[block.length - 1] = 1;
      byte[] previous = mac.doFinal(block);
      byte[] result = previous.clone();
      for (int round = 1; round < iterations; round++) {
        byte[] next = mac.doFinal(previous);
        Arrays.fill(previous, (byte) 0);
        previous = next;
        for (int i = 0; i < result.length; i++) result[i] ^= previous[i];
      }
      Arrays.fill(previous, (byte) 0);
      Arrays.fill(block, (byte) 0);
      return result;
    } finally {
      Arrays.fill(password, (byte) 0);
    }
  }

  static boolean matches(byte[] expected, byte[] supplied) {
    return MessageDigest.isEqual(expected, supplied);
  }

  static final class Attempts {
    final int count;
    final long lockedUntil;
    Attempts(int count, long lockedUntil) { this.count = count; this.lockedUntil = lockedUntil; }
  }

  static Attempts failedAttempt(Attempts previous, long now) {
    int count = Math.min(1000000, previous.count + 1);
    return new Attempts(count, count >= 5 ? now + LOCKOUT_MS : 0);
  }

  static boolean isLocked(Attempts state, long now) { return now < state.lockedUntil; }

  static int sampleSize(int width, int height, int maximum) {
    int sample = 1;
    long largest = Math.max(width, height);
    while ((largest + sample - 1) / sample > maximum) sample *= 2;
    return sample;
  }

  static Date parseDate(String value) {
    if (value == null || !value.matches("[0-9]{4}-[0-9]{2}-[0-9]{2}")) return null;
    SimpleDateFormat format = new SimpleDateFormat("yyyy-MM-dd", Locale.ROOT);
    format.setTimeZone(TimeZone.getTimeZone("GMT+03:00"));
    format.setLenient(false);
    try { return format.parse(value); } catch (ParseException ignored) { return null; }
  }
}
