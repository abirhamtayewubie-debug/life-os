import { describe, expect, it } from "vitest";
import { detectBank, parseBankMessages, parseBankSms, splitMessages } from "@/features/finance/sms";

const TODAY = "2026-10-23";

// Shaped like the real texts, with made-up names, numbers and references.
const CBE_DEBIT = "Dear Abebe your Account 1****5678 has been debited with ETB 500.00. Your Current Balance is ETB 12,345.67. Thank you for Banking with CBE! https://apps.cbe.com.et:100/?id=FT26295ABCDE12345678";
const CBE_CREDIT = "Dear Abebe your Account 1****5678 has been Credited with ETB 1,000.00 from Kebede Alemu, on 20/10/2026 at 10:30:15 with Ref No FT26293XYZ12 Your Current Balance is ETB 13,345.67. Thank you for Banking with CBE!";
const CBE_TRANSFER = "Dear Abebe, You have transfered ETB 300.00 to Sara Tesfaye on 21/10/2026 at 09:05:41 from your account 1****5678. Your account has been debited with a S.charge of ETB 2.00 and  15% VAT of ETB0.30, with a total of ETB302.30. Your Current Balance is ETB 1,234.56. Thank you for Banking with CBE! https://apps.cbe.com.et:100/?id=FT26294QWERT12345678";
const TELEBIRR_SENT = "Dear Abebe \nYou have transferred ETB 200.00 to Kebede Alemu (2519****1234) on 22/10/2026 15:20:11. Your transaction number is CJM1ABCDEF. The service fee is  ETB 0.87 and  15% VAT on the service fee is ETB 0.13. Your current E-Money Account  balance is ETB 1,234.56. To download your payment information please click this link: https://transactioninfo.ethiotelecom.et/receipt/CJM1ABCDEF.\n\nThank you for using telebirr\nEthio telecom";
const TELEBIRR_IN = "Dear Abebe \nYou have received ETB 750.00 from Hana Girma(2519****9876) on 23/10/2026 08:10:02. Your transaction number is CJN2GHIJKL. Your current E-Money Account balance is ETB 1,984.56.\nThank you for using telebirr\nEthio telecom";
const TELEBIRR_PAID = "Dear Abebe \nYou have paid ETB 150.00 to Bole Supermarket on 22/10/2026 19:44:10. Your transaction number is CJM3MNOPQR. Your current E-Money Account balance is ETB 1,084.56.\nThank you for using telebirr\nEthio telecom";

describe("bank texts", () => {
  it("knows which bank sent a text", () => {
    expect(detectBank(CBE_DEBIT)).toBe("cbe");
    expect(detectBank(TELEBIRR_SENT)).toBe("telebirr");
    expect(detectBank("Your Uber is arriving")).toBeNull();
  });

  it("reads a CBE debit with no date as today, keyed by its reference", () => {
    const r = parseBankSms(CBE_DEBIT, TODAY);
    expect(r.ok && r.tx).toMatchObject({ bank: "cbe", amount: "-500.00", occurred_on: TODAY, dateGuessed: true, reference: "FT26295ABCDE", balance: "12345.67", external_id: "sms:cbe:FT26295ABCDE" });
  });

  it("reads a CBE credit with its sender, date and reference", () => {
    const r = parseBankSms(CBE_CREDIT, TODAY);
    expect(r.ok && r.tx).toMatchObject({ amount: "1000.00", occurred_on: "2026-10-20", dateGuessed: false, counterparty: "Kebede Alemu", reference: "FT26293XYZ12", description: "CBE: From Kebede Alemu" });
  });

  it("counts CBE transfer charges in what left the account", () => {
    const r = parseBankSms(CBE_TRANSFER, TODAY);
    expect(r.ok && r.tx).toMatchObject({ amount: "-302.30", fees: "2.30", counterparty: "Sara Tesfaye", occurred_on: "2026-10-21", reference: "FT26294QWERT" });
  });

  it("reads telebirr transfers with the fee and VAT added", () => {
    const r = parseBankSms(TELEBIRR_SENT, TODAY);
    expect(r.ok && r.tx).toMatchObject({ bank: "telebirr", amount: "-201.00", fees: "1.00", counterparty: "Kebede Alemu", reference: "CJM1ABCDEF", balance: "1234.56", occurred_on: "2026-10-22" });
  });

  it("reads telebirr money in and payments", () => {
    const inn = parseBankSms(TELEBIRR_IN, TODAY);
    expect(inn.ok && inn.tx).toMatchObject({ amount: "750.00", counterparty: "Hana Girma", fees: null });
    const paid = parseBankSms(TELEBIRR_PAID, TODAY);
    expect(paid.ok && paid.tx).toMatchObject({ amount: "-150.00", counterparty: "Bole Supermarket", description: "telebirr: To Bole Supermarket" });
  });

  it("explains texts it can't use", () => {
    expect(parseBankSms("Hi, see you at 5", TODAY)).toMatchObject({ ok: false });
    expect(parseBankSms("Your CBE verification code is 123456", TODAY)).toMatchObject({ ok: false, error: "This is a code, not a transaction." });
  });

  it("never dates a text in the future", () => {
    const r = parseBankSms(CBE_CREDIT.replace("20/10/2026", "20/11/2026"), TODAY);
    expect(r.ok && r.tx).toMatchObject({ occurred_on: TODAY, dateGuessed: true });
  });

  it("splits a paste of several texts, keeping a sender line with its text", () => {
    expect(splitMessages(`${CBE_DEBIT}\n\n${TELEBIRR_IN}\n${TELEBIRR_PAID}`)).toHaveLength(3);
    expect(splitMessages(`CBE\n${CBE_DEBIT}`)).toEqual([`CBE\n${CBE_DEBIT}`]);
    const all = parseBankMessages([CBE_DEBIT, CBE_CREDIT, CBE_TRANSFER, TELEBIRR_SENT, TELEBIRR_IN, TELEBIRR_PAID].join("\n\n"), TODAY);
    expect(all.map((r) => r.ok)).toEqual([true, true, true, true, true, true]);
  });

  it("gives texts without a reference a stable key so a re-share isn't a duplicate", () => {
    const text = TELEBIRR_PAID.replace(/Your transaction number is \w+\. /, "");
    const a = parseBankSms(text, TODAY);
    const b = parseBankSms(text, "2026-10-30");
    expect(a.ok && b.ok && a.tx.external_id === b.tx.external_id).toBe(true);
  });
});
