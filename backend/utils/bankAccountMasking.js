/**
 * Utility for secure display of sensitive bank information
 */

/**
 * Masks a bank account number, showing only the last 4 digits
 * @param {string} accountNumber 
 * @returns {string}
 */
exports.maskAccountNumber = (accountNumber) => {
    if (!accountNumber) return '';
    const num = accountNumber.toString();
    if (num.length <= 4) return num;
    return '*'.repeat(num.length - 4) + num.slice(-4);
};

/**
 * Masks an IFSC code, showing only first 4 and last 2 characters
 * @param {string} ifsc 
 * @returns {string}
 */
exports.maskIFSC = (ifsc) => {
    if (!ifsc) return '';
    if (ifsc.length <= 6) return ifsc;
    return ifsc.slice(0, 4) + '*'.repeat(ifsc.length - 6) + ifsc.slice(-2);
};

/**
 * Masks a UPI ID, showing only first 2 and domain
 * @param {string} upiId 
 * @returns {string}
 */
exports.maskUPI = (upiId) => {
    if (!upiId) return '';
    const parts = upiId.split('@');
    if (parts.length < 2) return upiId;
    const username = parts[0];
    const domain = parts[1];
    if (username.length <= 2) return upiId;
    return username.slice(0, 2) + '*'.repeat(username.length - 2) + '@' + domain;
};

/**
 * Sanitizes a seller object's bank account for public/seller-view API responses
 * @param {Object} bankAccount 
 * @returns {Object}
 */
exports.sanitizeBankAccount = (bankAccount) => {
    if (!bankAccount) return null;
    return {
        accountHolderName: bankAccount.accountHolderName,
        accountNumber: exports.maskAccountNumber(bankAccount.accountNumber),
        ifscCode: exports.maskIFSC(bankAccount.ifscCode),
        bankName: bankAccount.bankName,
        branch: bankAccount.branch,
        accountType: bankAccount.accountType,
        upiId: exports.maskUPI(bankAccount.upiId)
    };
};
