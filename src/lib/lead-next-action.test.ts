import { describe, it, expect } from "vitest";
import { computeNextAction, type CadenceRow } from "./lead-next-action";

// Cadence test fixture — 3 step, max 5 touches.
function cad(over: Partial<CadenceRow> = {}): CadenceRow {
  return {
    stage: "moi",
    step_no: 1,
    channel: "call",
    offset_hours: 2,
    priority: "binh_thuong",
    reason_tpl: null,
    max_touches: 5,
    active: true,
    ...over,
  };
}

const stageStart = "2026-05-24T08:00:00.000Z";
const now = new Date("2026-05-24T10:00:00.000Z"); // 2h sau stageStart

describe("computeNextAction — null cases", () => {
  it("doNotContact=true → null", () => {
    expect(
      computeNextAction({
        trangThai: "moi", doNotContact: true, touchesInStage: 0,
        stageStartAt: stageStart, lastOutcome: null, cadence: [cad()], now,
      }),
    ).toBeNull();
  });

  it("stage chot_deal (terminal) → null", () => {
    expect(
      computeNextAction({
        trangThai: "chot_deal", doNotContact: false, touchesInStage: 0,
        stageStartAt: stageStart, lastOutcome: null, cadence: [cad({ stage: "chot_deal" })], now,
      }),
    ).toBeNull();
  });

  it("stage mat_khach (terminal) → null", () => {
    expect(
      computeNextAction({
        trangThai: "mat_khach", doNotContact: false, touchesInStage: 0,
        stageStartAt: stageStart, lastOutcome: null, cadence: [cad({ stage: "mat_khach" })], now,
      }),
    ).toBeNull();
  });

  it("lastOutcome=refused → null", () => {
    expect(
      computeNextAction({
        trangThai: "moi", doNotContact: false, touchesInStage: 1,
        stageStartAt: stageStart, lastOutcome: "refused", cadence: [cad()], now,
      }),
    ).toBeNull();
  });

  it("lastOutcome=wrong_info → null", () => {
    expect(
      computeNextAction({
        trangThai: "moi", doNotContact: false, touchesInStage: 1,
        stageStartAt: stageStart, lastOutcome: "wrong_info", cadence: [cad()], now,
      }),
    ).toBeNull();
  });

  it("cadence rỗng → null", () => {
    expect(
      computeNextAction({
        trangThai: "moi", doNotContact: false, touchesInStage: 0,
        stageStartAt: stageStart, lastOutcome: null, cadence: [], now,
      }),
    ).toBeNull();
  });

  it("cadence chỉ có row active=false → null", () => {
    expect(
      computeNextAction({
        trangThai: "moi", doNotContact: false, touchesInStage: 0,
        stageStartAt: stageStart, lastOutcome: null,
        cadence: [cad({ active: false })], now,
      }),
    ).toBeNull();
  });

  it("cadence stage khác → null (filter stage)", () => {
    expect(
      computeNextAction({
        trangThai: "moi", doNotContact: false, touchesInStage: 0,
        stageStartAt: stageStart, lastOutcome: null,
        cadence: [cad({ stage: "da_lien_he" })], now,
      }),
    ).toBeNull();
  });

  it("touchesInStage = max_touches → null (vượt trần)", () => {
    expect(
      computeNextAction({
        trangThai: "moi", doNotContact: false, touchesInStage: 5,
        stageStartAt: stageStart, lastOutcome: null,
        cadence: [cad({ max_touches: 5 })], now,
      }),
    ).toBeNull();
  });
});

describe("computeNextAction — chọn step", () => {
  it("touchesInStage=0 → chọn step_no=1", () => {
    const r = computeNextAction({
      trangThai: "moi", doNotContact: false, touchesInStage: 0,
      stageStartAt: stageStart, lastOutcome: null,
      cadence: [
        cad({ step_no: 1, channel: "call", offset_hours: 2 }),
        cad({ step_no: 2, channel: "zalo", offset_hours: 24 }),
      ],
      now,
    });
    expect(r?.channel).toBe("call");
  });

  it("touchesInStage=1 → chọn step_no=2", () => {
    const r = computeNextAction({
      trangThai: "moi", doNotContact: false, touchesInStage: 1,
      stageStartAt: stageStart, lastOutcome: null,
      cadence: [
        cad({ step_no: 1, channel: "call", offset_hours: 2 }),
        cad({ step_no: 2, channel: "zalo", offset_hours: 24 }),
      ],
      now,
    });
    expect(r?.channel).toBe("zalo");
  });

  it("nextStep vượt qua step_no max nhưng chưa vượt max_touches → fallback row cuối", () => {
    // 2 step nhưng max_touches=5 → step 3,4,5 dùng step cuối (step 2)
    const r = computeNextAction({
      trangThai: "moi", doNotContact: false, touchesInStage: 2,
      stageStartAt: stageStart, lastOutcome: null,
      cadence: [
        cad({ step_no: 1, channel: "call" }),
        cad({ step_no: 2, channel: "zalo", max_touches: 5 }),
      ],
      now,
    });
    expect(r?.channel).toBe("zalo"); // fallback row cuối
  });

  it("max_touches lấy từ row đầu (sau sort step_no)", () => {
    // Cadence ngược thứ tự → sort sẽ đưa step_no=1 lên đầu, lấy max_touches=3
    const r = computeNextAction({
      trangThai: "moi", doNotContact: false, touchesInStage: 3,
      stageStartAt: stageStart, lastOutcome: null,
      cadence: [
        cad({ step_no: 2, max_touches: 99 }), // ignored
        cad({ step_no: 1, max_touches: 3 }), // dùng cái này
      ],
      now,
    });
    expect(r).toBeNull(); // nextStep=4 > max_touches=3
  });
});

describe("computeNextAction — due_at", () => {
  it("due = stageStart + offset_hours (chưa qua giờ)", () => {
    const future = "2026-05-24T08:00:00.000Z"; // stageStart
    const r = computeNextAction({
      trangThai: "moi", doNotContact: false, touchesInStage: 0,
      stageStartAt: future, lastOutcome: null,
      cadence: [cad({ offset_hours: 24 })],
      now: new Date("2026-05-24T09:00:00.000Z"), // 1h sau start, due = +24h chưa qua
    });
    expect(r?.due_at).toBe("2026-05-25T08:00:00.000Z");
  });

  it("due tính ra trong quá khứ → fallback now + 2h", () => {
    // stageStart 08:00, offset 2h → due = 10:00. Now = 12:00 → đã qua → now + 2h = 14:00
    const r = computeNextAction({
      trangThai: "moi", doNotContact: false, touchesInStage: 0,
      stageStartAt: stageStart, lastOutcome: null,
      cadence: [cad({ offset_hours: 2 })],
      now: new Date("2026-05-24T12:00:00.000Z"),
    });
    expect(r?.due_at).toBe("2026-05-24T14:00:00.000Z");
  });

  it("lastOutcome=promised_later → cộng thêm 72h", () => {
    // stageStart 24/5 08:00, offset 2h + 72h = 74h → 27/5 10:00
    const r = computeNextAction({
      trangThai: "moi", doNotContact: false, touchesInStage: 1,
      stageStartAt: stageStart, lastOutcome: "promised_later",
      cadence: [cad({ offset_hours: 2 })],
      now,
    });
    expect(r?.due_at).toBe("2026-05-27T10:00:00.000Z");
  });

  it("lastOutcome=rep_need_info → cộng thêm 2h", () => {
    // offset 2h + 2h = 4h → 12:00. Now = 10:00 (chưa qua) → giữ 12:00
    const r = computeNextAction({
      trangThai: "moi", doNotContact: false, touchesInStage: 1,
      stageStartAt: stageStart, lastOutcome: "rep_need_info",
      cadence: [cad({ offset_hours: 2 })],
      now,
    });
    expect(r?.due_at).toBe("2026-05-24T12:00:00.000Z");
  });
});

describe("computeNextAction — priority", () => {
  it("default → row.priority", () => {
    const r = computeNextAction({
      trangThai: "moi", doNotContact: false, touchesInStage: 0,
      stageStartAt: stageStart, lastOutcome: null,
      cadence: [cad({ priority: "binh_thuong" })], now,
    });
    expect(r?.priority).toBe("binh_thuong");
  });

  it("rep_need_info → 'gap' (override)", () => {
    const r = computeNextAction({
      trangThai: "moi", doNotContact: false, touchesInStage: 1,
      stageStartAt: stageStart, lastOutcome: "rep_need_info",
      cadence: [cad({ priority: "khong_gap" })], // bị override
      now,
    });
    expect(r?.priority).toBe("gap");
  });

  it("promised_later → 'khong_gap' (override)", () => {
    const r = computeNextAction({
      trangThai: "moi", doNotContact: false, touchesInStage: 1,
      stageStartAt: stageStart, lastOutcome: "promised_later",
      cadence: [cad({ priority: "gap" })], // bị override
      now,
    });
    expect(r?.priority).toBe("khong_gap");
  });

  it("rep_interested → giữ row.priority (KHÔNG override)", () => {
    const r = computeNextAction({
      trangThai: "moi", doNotContact: false, touchesInStage: 1,
      stageStartAt: stageStart, lastOutcome: "rep_interested",
      cadence: [cad({ priority: "gap" })], now,
    });
    expect(r?.priority).toBe("gap");
  });
});

describe("computeNextAction — reason & suggested_script", () => {
  it("reason_tpl=null → reason auto theo channel + bước", () => {
    const r = computeNextAction({
      trangThai: "moi", doNotContact: false, touchesInStage: 0,
      stageStartAt: stageStart, lastOutcome: null,
      cadence: [cad({ step_no: 1, channel: "call", reason_tpl: null })], now,
    });
    expect(r?.reason).toBe("Gọi điện (bước 1)");
    expect(r?.suggested_script).toBeNull();
  });

  it("reason_tpl có giá trị → dùng nguyên text + suggested_script = reason_tpl", () => {
    const r = computeNextAction({
      trangThai: "moi", doNotContact: false, touchesInStage: 0,
      stageStartAt: stageStart, lastOutcome: null,
      cadence: [cad({ reason_tpl: "Hỏi khách có sẵn sàng book chưa" })], now,
    });
    expect(r?.reason).toBe("Hỏi khách có sẵn sàng book chưa");
    expect(r?.suggested_script).toBe("Hỏi khách có sẵn sàng book chưa");
  });

  it("channel lạ + reason_tpl=null → fallback channel raw + (bước N)", () => {
    const r = computeNextAction({
      trangThai: "moi", doNotContact: false, touchesInStage: 0,
      stageStartAt: stageStart, lastOutcome: null,
      cadence: [cad({ step_no: 1, channel: "carrier_pigeon", reason_tpl: null })], now,
    });
    expect(r?.reason).toBe("carrier_pigeon (bước 1)");
  });
});

describe("computeNextAction — kịch bản end-to-end", () => {
  it("Lead mới, chưa touch → call ngay sau 2h, priority binh_thuong", () => {
    const r = computeNextAction({
      trangThai: "moi",
      doNotContact: false,
      touchesInStage: 0,
      stageStartAt: stageStart,
      lastOutcome: null,
      cadence: [
        cad({ step_no: 1, channel: "call", offset_hours: 2, priority: "binh_thuong" }),
        cad({ step_no: 2, channel: "zalo", offset_hours: 24 }),
        cad({ step_no: 3, channel: "email", offset_hours: 72 }),
      ],
      now: new Date("2026-05-24T08:30:00.000Z"), // 30 phút sau start
    });
    expect(r).toEqual({
      channel: "call",
      due_at: "2026-05-24T10:00:00.000Z", // start + 2h
      priority: "binh_thuong",
      reason: "Gọi điện (bước 1)",
      suggested_script: null,
    });
  });

  it("Touch 1 không phản hồi → step 2 zalo theo schedule", () => {
    const r = computeNextAction({
      trangThai: "moi",
      doNotContact: false,
      touchesInStage: 1,
      stageStartAt: stageStart,
      lastOutcome: "no_response",
      cadence: [
        cad({ step_no: 1, channel: "call", offset_hours: 2 }),
        cad({ step_no: 2, channel: "zalo", offset_hours: 24, priority: "binh_thuong" }),
      ],
      now: new Date("2026-05-24T11:00:00.000Z"),
    });
    expect(r?.channel).toBe("zalo");
    expect(r?.due_at).toBe("2026-05-25T08:00:00.000Z"); // start + 24h
    expect(r?.priority).toBe("binh_thuong");
  });
});
