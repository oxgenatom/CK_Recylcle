import type { Draft } from "../model";
// Contact bank IDs from the current FlowAccount OpenAPI Contact schema.
const banks: Record<number, string> = {
  1: "ธนาคารกรุงเทพ", 2: "ธนาคารกสิกรไทย", 3: "ธนาคารกรุงไทย",
  4: "ธนาคารทหารไทย", 5: "ธนาคารไทยพาณิชย์", 6: "ธนาคารสแตนดาร์ดชาร์เตอร์ด",
  7: "ธนาคารซีไอเอ็มบี ไทย", 8: "ธนาคารยูโอบี", 9: "ธนาคารกรุงศรีอยุธยา",
  10: "ธนาคารออมสิน", 11: "ธนาคารธนชาต", 12: "ธนาคารแลนด์ แอนด์ เฮ้าส์",
  16: "ธนาคารเกียรตินาคิน", 18: "ธนาคารซิตี้แบงก์", 19: "ธนาคารทิสโก้",
  20: "ธนาคารเพื่อการเกษตรและสหกรณ์การเกษตร", 21: "ธนาคารเพื่อการส่งออกและนำเข้าแห่งประเทศไทย",
  22: "ธนาคารอาคารสงเคราะห์", 23: "ธนาคารพัฒนาวิสาหกิจขนาดกลางและขนาดย่อมแห่งประเทศไทย",
  24: "ธนาคารอิสลามแห่งประเทศไทย", 25: "ธนาคารแห่งประเทศจีน (ไทย)",
  26: "ธนาคารไอซีบีซี (ไทย)", 27: "ธนาคารเมกะ สากลพาณิชย์",
  28: "ธนาคารซูมิโตโม มิตซุย แบงกิ้ง คอร์ปอเรชั่น", 29: "ธนาคารมิซูโฮ",
  30: "ธนาคารฮ่องกงและเซี่ยงไฮ้แบงกิ้งคอร์ปอเรชั่น", 31: "ธนาคารไทยเครดิต เพื่อรายย่อย",
  32: "ธนาคารดอยซ์แบงก์", 33: "ธนาคารอินเดียนโอเวอร์ซีส์", 34: "ธนาคารแห่งอเมริกา",
};
const value = (v: unknown) => v == null ? "" : String(v).trim();
export function contactBank(contact: Record<string, unknown>): Draft["bank"] {
  const accountNumber = value(contact.contactBankAccountNumber);
  if (!accountNumber || accountNumber === "0") return undefined;
  const id = Number(contact.contactBankId);
  return {
    name: value(contact.contactBankName) || banks[id] || (id > 0 ? `ธนาคารรหัส ${id}` : ""),
    accountName: value(contact.contactBankAccountName),
    accountNumber,
    branch: value(contact.contactBankBranch),
  };
}
