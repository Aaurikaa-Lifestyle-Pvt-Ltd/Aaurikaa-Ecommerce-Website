const { generateOTP } = require('../../utils/otpService');

describe('OTP Service - Core Functions', () => {
  describe('generateOTP', () => {
    it('should generate a 6-digit OTP', () => {
      const otp = generateOTP();
      expect(otp).toMatch(/^\d{6}$/);
      expect(otp.length).toBe(6);
    });

    it('should generate different OTPs', () => {
      const otp1 = generateOTP();
      const otp2 = generateOTP();
      expect(otp1).not.toBe(otp2);
    });

    it('should generate numeric OTPs only', () => {
      for (let i = 0; i < 10; i++) {
        const otp = generateOTP();
        expect(otp).toMatch(/^\d+$/);
        expect(otp.length).toBe(6);
      }
    });

    it('should generate OTPs within valid range', () => {
      for (let i = 0; i < 10; i++) {
        const otp = generateOTP();
        const otpNumber = parseInt(otp);
        expect(otpNumber).toBeGreaterThanOrEqual(100000);
        expect(otpNumber).toBeLessThanOrEqual(999999);
      }
    });
  });
});
