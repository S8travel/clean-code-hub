import { useMutation } from "@tanstack/react-query";
import { externalSupabase, EXTERNAL_SUPABASE_URL } from "@/lib/supabase-external";

export interface VcbRate {
  rate: number;          // giá MUA VND/USD
  rate_transfer: number; // chuyển khoản (tham khảo)
  rate_sell: number;     // bán (tham khảo)
  date: string;          // ngày VCB công bố
  source: "VCB";
  currency: "USD";
  side: "buy";
  cached: boolean;
}

// Fetch tỷ giá USD/VND (giá MUA) từ Vietcombank qua edge fn get-exchange-rate.
// Edge fn cache 30 phút → gọi nhiều lần trong cùng 30' chỉ hit VCB 1 lần.
export function useFetchExchangeRate() {
  return useMutation({
    mutationFn: async (): Promise<VcbRate> => {
      const session = await externalSupabase.auth.getSession();
      const token = session.data.session?.access_token;
      const resp = await fetch(`${EXTERNAL_SUPABASE_URL}/functions/v1/get-exchange-rate`, {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: `HTTP ${resp.status}` }));
        throw new Error(err.error ?? "Lỗi lấy tỷ giá");
      }
      return resp.json();
    },
  });
}
