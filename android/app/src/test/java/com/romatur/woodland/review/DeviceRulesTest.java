package com.romatur.woodland.review;

import static org.junit.Assert.*;
import org.junit.Test;
import javax.crypto.SecretKeyFactory;
import javax.crypto.spec.PBEKeySpec;

public class DeviceRulesTest {
  @Test public void pinDerivationMatchesStandardPbkdf2Sha256() throws Exception {
    byte[] salt = new byte[24];
    for (int i = 0; i < salt.length; i++) salt[i] = (byte) i;
    byte[] expected = SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256")
      .generateSecret(new PBEKeySpec("135790".toCharArray(), salt, 3, 256)).getEncoded();
    assertArrayEquals(expected, DeviceRules.derivePin("135790", salt, 3));
    assertFalse(DeviceRules.matches(expected, DeviceRules.derivePin("135791", salt, 3)));
  }

  @Test public void onlyOpaqueOwnedFilenamesAreAccepted() {
    assertTrue(DeviceRules.validPhotoName("photo_12345678-abcd-1234-abcd-123456789abc.jpg"));
    for (String value : new String[] {"../photo_12345678-abcd-1234-abcd-123456789abc.jpg", "file:///etc/passwd", "photo_a.jpg", "photo_12345678-abcd-1234-abcd-123456789abc.jpg/child", "photo_12345678-abcd-1234-abcd-123456789abc.JPG"}) {
      assertFalse(value, DeviceRules.validPhotoName(value));
    }
    assertFalse(DeviceRules.validPdfName("../pdf_12345678-abcd-1234-abcd-123456789abc.pdf"));
  }

  @Test public void fiveFailedAttemptsLockUntilCooldownAndKeepFailureCount() {
    DeviceRules.Attempts state = new DeviceRules.Attempts(0, 0);
    for (int i = 0; i < 4; i++) state = DeviceRules.failedAttempt(state, 1000);
    assertEquals(0L, state.lockedUntil);
    state = DeviceRules.failedAttempt(state, 1000);
    assertEquals(5, state.count);
    assertEquals(901000L, state.lockedUntil);
    assertTrue(DeviceRules.isLocked(state, 900999));
    assertFalse(DeviceRules.isLocked(state, 901000));
    assertEquals(1801000L, DeviceRules.failedAttempt(state, 901000).lockedUntil);
  }

  @Test public void dateParsingRejectsRolloverAndNonCanonicalDates() {
    assertNotNull(DeviceRules.parseDate("2024-02-29"));
    for (String value : new String[] {"2023-02-29", "2024-13-01", "2024-2-03", "2024-02-03junk", "1900-02-29"}) {
      assertNull(value, DeviceRules.parseDate(value));
    }
  }

  @Test public void imageSamplingRoundsUpAtDecodeBoundary() {
    assertEquals(1, DeviceRules.sampleSize(2048, 1536, 2048));
    assertEquals(2, DeviceRules.sampleSize(4096, 3000, 2048));
    assertEquals(4, DeviceRules.sampleSize(4097, 3000, 2048));
    assertEquals(8, DeviceRules.sampleSize(3000, 6000, 1024));
  }
}
