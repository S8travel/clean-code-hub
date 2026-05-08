// CC mặc định cho email booking, theo loại
// hddt = phòng kế toán/hóa đơn (luôn có); op1 = điều hành 1; op2 = điều hành 2
export const BOOKING_CC = {
  ks: ["s8travel.hddt@gmail.com", "s8travel.op2@gmail.com"],
  nh: ["s8travel.hddt@gmail.com", "s8travel.op1@gmail.com"],
  dv: ["s8travel.hddt@gmail.com", "s8travel.op1@gmail.com"],
  xe: ["s8travel.hddt@gmail.com"],
  visa: ["s8travel.hddt@gmail.com"],
} as const;

export type BookingCcType = keyof typeof BOOKING_CC;
