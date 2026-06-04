export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      activity_log: {
        Row: {
          action: string
          created_at: string | null
          doan_id: number | null
          ho_ten: string | null
          id: number
          mo_ta: string | null
          record_id: string | null
          table_name: string
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string | null
          doan_id?: number | null
          ho_ten?: string | null
          id?: never
          mo_ta?: string | null
          record_id?: string | null
          table_name: string
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string | null
          doan_id?: number | null
          ho_ten?: string | null
          id?: never
          mo_ta?: string | null
          record_id?: string | null
          table_name?: string
          user_id?: string | null
        }
        Relationships: []
      }
      agents: {
        Row: {
          id: number
          ten: string | null
        }
        Insert: {
          id?: never
          ten?: string | null
        }
        Update: {
          id?: never
          ten?: string | null
        }
        Relationships: []
      }
      bang_gia_dich_vu: {
        Row: {
          active: boolean | null
          created_at: string | null
          foc: number | null
          gia: number | null
          id: number
          loai: string
          ten: string
        }
        Insert: {
          active?: boolean | null
          created_at?: string | null
          foc?: number | null
          gia?: number | null
          id?: never
          loai?: string
          ten: string
        }
        Update: {
          active?: boolean | null
          created_at?: string | null
          foc?: number | null
          gia?: number | null
          id?: never
          loai?: string
          ten?: string
        }
        Relationships: []
      }
      bao_gia: {
        Row: {
          created_at: string | null
          created_by: string | null
          exchange_rate: number | null
          ghi_chu: string | null
          hieu_luc_ngay: number | null
          id: number
          ket_qua: Json | null
          lead_id: number | null
          ma_bg: string | null
          ngay_di: string | null
          ngay_ve: string | null
          noi_dung_goc: string | null
          phu_thu: number
          profit_usd: number | null
          tieu_de: string | null
          trang_thai: string | null
          vcb_rate: number | null
          xe_gia: number | null
          xe_ten: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          exchange_rate?: number | null
          ghi_chu?: string | null
          hieu_luc_ngay?: number | null
          id?: never
          ket_qua?: Json | null
          lead_id?: number | null
          ma_bg?: never
          ngay_di?: string | null
          ngay_ve?: string | null
          noi_dung_goc?: string | null
          phu_thu?: number
          profit_usd?: number | null
          tieu_de?: string | null
          trang_thai?: string | null
          vcb_rate?: number | null
          xe_gia?: number | null
          xe_ten?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          exchange_rate?: number | null
          ghi_chu?: string | null
          hieu_luc_ngay?: number | null
          id?: never
          ket_qua?: Json | null
          lead_id?: number | null
          ma_bg?: never
          ngay_di?: string | null
          ngay_ve?: string | null
          noi_dung_goc?: string | null
          phu_thu?: number
          profit_usd?: number | null
          tieu_de?: string | null
          trang_thai?: string | null
          vcb_rate?: number | null
          xe_gia?: number | null
          xe_ten?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bao_gia_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "lead"
            referencedColumns: ["id"]
          },
        ]
      }
      canh_diem: {
        Row: {
          co_phi: boolean | null
          created_at: string | null
          dia_diem: string | null
          don_vi: string | null
          email: string | null
          ghi_chu: string | null
          gia_mac_dinh: number | null
          icon: string | null
          id: number
          khach_san_id: number | null
          loai: string | null
          nguoi_thanh_toan: string | null
          nha_cung_cap_id: number | null
          so_dien_thoai: string | null
          tai_khoan_thanh_toan: string | null
          ten: string | null
          ten_nha_cung_cap: string | null
          thong_tin_chung: string | null
        }
        Insert: {
          co_phi?: boolean | null
          created_at?: string | null
          dia_diem?: string | null
          don_vi?: string | null
          email?: string | null
          ghi_chu?: string | null
          gia_mac_dinh?: number | null
          icon?: string | null
          id?: never
          khach_san_id?: number | null
          loai?: string | null
          nguoi_thanh_toan?: string | null
          nha_cung_cap_id?: number | null
          so_dien_thoai?: string | null
          tai_khoan_thanh_toan?: string | null
          ten?: string | null
          ten_nha_cung_cap?: string | null
          thong_tin_chung?: string | null
        }
        Update: {
          co_phi?: boolean | null
          created_at?: string | null
          dia_diem?: string | null
          don_vi?: string | null
          email?: string | null
          ghi_chu?: string | null
          gia_mac_dinh?: number | null
          icon?: string | null
          id?: never
          khach_san_id?: number | null
          loai?: string | null
          nguoi_thanh_toan?: string | null
          nha_cung_cap_id?: number | null
          so_dien_thoai?: string | null
          tai_khoan_thanh_toan?: string | null
          ten?: string | null
          ten_nha_cung_cap?: string | null
          thong_tin_chung?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "canh_diem_khach_san_id_fkey"
            columns: ["khach_san_id"]
            isOneToOne: false
            referencedRelation: "khach_san"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "canh_diem_nha_cung_cap_id_fkey"
            columns: ["nha_cung_cap_id"]
            isOneToOne: false
            referencedRelation: "nha_cung_cap"
            referencedColumns: ["id"]
          },
        ]
      }
      cong_no: {
        Row: {
          created_at: string | null
          dntt_goc_id: number | null
          doan_id: number | null
          ghi_chu: string | null
          id: number
          loai: string
          ly_do: string | null
          ngay_tao: string | null
          nha_cung_cap_id: number | null
          so_tien_goc: number
          ten_nha_cung_cap: string | null
          trang_thai: string
        }
        Insert: {
          created_at?: string | null
          dntt_goc_id?: number | null
          doan_id?: number | null
          ghi_chu?: string | null
          id?: number
          loai?: string
          ly_do?: string | null
          ngay_tao?: string | null
          nha_cung_cap_id?: number | null
          so_tien_goc: number
          ten_nha_cung_cap?: string | null
          trang_thai?: string
        }
        Update: {
          created_at?: string | null
          dntt_goc_id?: number | null
          doan_id?: number | null
          ghi_chu?: string | null
          id?: number
          loai?: string
          ly_do?: string | null
          ngay_tao?: string | null
          nha_cung_cap_id?: number | null
          so_tien_goc?: number
          ten_nha_cung_cap?: string | null
          trang_thai?: string
        }
        Relationships: [
          {
            foreignKeyName: "cong_no_dntt_goc_id_fkey"
            columns: ["dntt_goc_id"]
            isOneToOne: false
            referencedRelation: "de_nghi_thanh_toan"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cong_no_dntt_goc_id_fkey"
            columns: ["dntt_goc_id"]
            isOneToOne: false
            referencedRelation: "dntt_with_payment_status"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cong_no_doan_id_fkey"
            columns: ["doan_id"]
            isOneToOne: false
            referencedRelation: "doan"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cong_no_nha_cung_cap_id_fkey"
            columns: ["nha_cung_cap_id"]
            isOneToOne: false
            referencedRelation: "nha_cung_cap"
            referencedColumns: ["id"]
          },
        ]
      }
      cong_viec: {
        Row: {
          created_at: string | null
          do_uu_tien: string
          doan_id: number | null
          ghi_chu_ket_qua: string | null
          han_xu_ly: string | null
          id: number
          loai_viec: string
          mo_ta: string | null
          nguoi_giao: string
          nguoi_nhan: string
          tieu_de: string
          trang_thai: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          do_uu_tien?: string
          doan_id?: number | null
          ghi_chu_ket_qua?: string | null
          han_xu_ly?: string | null
          id?: number
          loai_viec?: string
          mo_ta?: string | null
          nguoi_giao: string
          nguoi_nhan: string
          tieu_de: string
          trang_thai?: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          do_uu_tien?: string
          doan_id?: number | null
          ghi_chu_ket_qua?: string | null
          han_xu_ly?: string | null
          id?: number
          loai_viec?: string
          mo_ta?: string | null
          nguoi_giao?: string
          nguoi_nhan?: string
          tieu_de?: string
          trang_thai?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cong_viec_doan_id_fkey"
            columns: ["doan_id"]
            isOneToOne: false
            referencedRelation: "doan"
            referencedColumns: ["id"]
          },
        ]
      }
      cong_viec_comment: {
        Row: {
          cong_viec_id: number
          created_at: string | null
          id: number
          noi_dung: string
          user_id: string
        }
        Insert: {
          cong_viec_id: number
          created_at?: string | null
          id?: number
          noi_dung: string
          user_id: string
        }
        Update: {
          cong_viec_id?: number
          created_at?: string | null
          id?: number
          noi_dung?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cong_viec_comment_cong_viec_id_fkey"
            columns: ["cong_viec_id"]
            isOneToOne: false
            referencedRelation: "cong_viec"
            referencedColumns: ["id"]
          },
        ]
      }
      de_nghi_thanh_toan: {
        Row: {
          created_at: string | null
          doan_id: number | null
          duyet_boi: string | null
          duyet_luc: string | null
          exported_to_sheet_at: string | null
          ghi_chu: string | null
          hoa_don_so_tien: number | null
          hoa_don_url: string | null
          hoan_ung_items: Json | null
          huy_boi: string | null
          huy_luc: string | null
          id: number
          ktt_duyet_boi: string | null
          ktt_duyet_luc: string | null
          kttt_duyet_boi: string | null
          kttt_duyet_luc: string | null
          la_coc: boolean | null
          loai: string
          loai_chi_hoan_ung: string | null
          mo_ta: string | null
          ngan_hang: string | null
          ngay_can_thanh_toan: string | null
          nguoi_ung_id: string | null
          nha_cung_cap_id: number | null
          quyet_toan_data: Json | null
          ref_id: number | null
          ref_loai: string | null
          so_tai_khoan: string | null
          so_tien: number
          tao_boi: string | null
          tao_luc: string | null
          ten_nha_cung_cap: string | null
          tp_dh_duyet_boi: string | null
          tp_dh_duyet_luc: string | null
          trang_thai_duyet: string
          trang_thai_hoa_don: string
          trang_thai_unc: string
          tu_choi_boi: string | null
          tu_choi_cap: number | null
          tu_choi_luc: string | null
          ty_le_coc: number | null
          unc_url: string | null
        }
        Insert: {
          created_at?: string | null
          doan_id?: number | null
          duyet_boi?: string | null
          duyet_luc?: string | null
          exported_to_sheet_at?: string | null
          ghi_chu?: string | null
          hoa_don_so_tien?: number | null
          hoa_don_url?: string | null
          hoan_ung_items?: Json | null
          huy_boi?: string | null
          huy_luc?: string | null
          id?: never
          ktt_duyet_boi?: string | null
          ktt_duyet_luc?: string | null
          kttt_duyet_boi?: string | null
          kttt_duyet_luc?: string | null
          la_coc?: boolean | null
          loai: string
          loai_chi_hoan_ung?: string | null
          mo_ta?: string | null
          ngan_hang?: string | null
          ngay_can_thanh_toan?: string | null
          nguoi_ung_id?: string | null
          nha_cung_cap_id?: number | null
          quyet_toan_data?: Json | null
          ref_id?: number | null
          ref_loai?: string | null
          so_tai_khoan?: string | null
          so_tien?: number
          tao_boi?: string | null
          tao_luc?: string | null
          ten_nha_cung_cap?: string | null
          tp_dh_duyet_boi?: string | null
          tp_dh_duyet_luc?: string | null
          trang_thai_duyet?: string
          trang_thai_hoa_don?: string
          trang_thai_unc?: string
          tu_choi_boi?: string | null
          tu_choi_cap?: number | null
          tu_choi_luc?: string | null
          ty_le_coc?: number | null
          unc_url?: string | null
        }
        Update: {
          created_at?: string | null
          doan_id?: number | null
          duyet_boi?: string | null
          duyet_luc?: string | null
          exported_to_sheet_at?: string | null
          ghi_chu?: string | null
          hoa_don_so_tien?: number | null
          hoa_don_url?: string | null
          hoan_ung_items?: Json | null
          huy_boi?: string | null
          huy_luc?: string | null
          id?: never
          ktt_duyet_boi?: string | null
          ktt_duyet_luc?: string | null
          kttt_duyet_boi?: string | null
          kttt_duyet_luc?: string | null
          la_coc?: boolean | null
          loai?: string
          loai_chi_hoan_ung?: string | null
          mo_ta?: string | null
          ngan_hang?: string | null
          ngay_can_thanh_toan?: string | null
          nguoi_ung_id?: string | null
          nha_cung_cap_id?: number | null
          quyet_toan_data?: Json | null
          ref_id?: number | null
          ref_loai?: string | null
          so_tai_khoan?: string | null
          so_tien?: number
          tao_boi?: string | null
          tao_luc?: string | null
          ten_nha_cung_cap?: string | null
          tp_dh_duyet_boi?: string | null
          tp_dh_duyet_luc?: string | null
          trang_thai_duyet?: string
          trang_thai_hoa_don?: string
          trang_thai_unc?: string
          tu_choi_boi?: string | null
          tu_choi_cap?: number | null
          tu_choi_luc?: string | null
          ty_le_coc?: number | null
          unc_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "de_nghi_thanh_toan_doan_id_fkey"
            columns: ["doan_id"]
            isOneToOne: false
            referencedRelation: "doan"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "de_nghi_thanh_toan_nha_cung_cap_id_fkey"
            columns: ["nha_cung_cap_id"]
            isOneToOne: false
            referencedRelation: "nha_cung_cap"
            referencedColumns: ["id"]
          },
        ]
      }
      dia_diem: {
        Row: {
          id: number
          mien: string | null
          ten: string | null
        }
        Insert: {
          id?: never
          mien?: string | null
          ten?: string | null
        }
        Update: {
          id?: never
          mien?: string | null
          ten?: string | null
        }
        Relationships: []
      }
      dntt_allocations: {
        Row: {
          chi_phi_id: number
          created_at: string
          dntt_id: number
          ghi_chu: string | null
          id: number
          so_tien: number
        }
        Insert: {
          chi_phi_id: number
          created_at?: string
          dntt_id: number
          ghi_chu?: string | null
          id?: number
          so_tien: number
        }
        Update: {
          chi_phi_id?: number
          created_at?: string
          dntt_id?: number
          ghi_chu?: string | null
          id?: number
          so_tien?: number
        }
        Relationships: [
          {
            foreignKeyName: "dntt_allocations_chi_phi_id_fkey"
            columns: ["chi_phi_id"]
            isOneToOne: false
            referencedRelation: "doan_chi_phi"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dntt_allocations_dntt_id_fkey"
            columns: ["dntt_id"]
            isOneToOne: false
            referencedRelation: "de_nghi_thanh_toan"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dntt_allocations_dntt_id_fkey"
            columns: ["dntt_id"]
            isOneToOne: false
            referencedRelation: "dntt_with_payment_status"
            referencedColumns: ["id"]
          },
        ]
      }
      doan: {
        Row: {
          agent_huy_id: number | null
          agent_id: number | null
          assigned_to: string | null
          bang_don: string | null
          booking_khach_san_id: number | null
          booking_nha_hang_id: number | null
          booking_status: string | null
          chu_thich_khach: string | null
          chuyen_bay_don: string | null
          chuyen_bay_tien: string | null
          co_tinh_suat_tl_nha_hang: boolean | null
          created_at: string | null
          created_by: string | null
          dia_diem_id: number | null
          file_chuong_trinh: string | null
          ghi_chu: string | null
          ghi_chu_dieu_tour: string | null
          huong_dan_vien_id: number | null
          huong_dan_vien_id_2: number | null
          id: number
          ks_escalate_level: number
          loai_tour: string | null
          ly_do_huy: string | null
          ngay_di: string | null
          ngay_ve: string | null
          nh_escalate_level: number
          seri_id: number | null
          shopping: boolean | null
          so_khach: number | null
          so_khach_em1: number | null
          so_khach_em2: number | null
          so_khach_lon: number | null
          so_khach_tl: number | null
          tang_pham: Json | null
          ten_doan: string | null
          thi_truong: string | null
          thu_tip: boolean | null
          tip_lump_sum: number | null
          tip_rate: number | null
          tip_so_khach_override: number | null
          tip_so_ngay_override: number | null
          trang_thai: string | null
          truong_doan: string | null
          van_phong_id: number | null
          xe_id: number | null
        }
        Insert: {
          agent_huy_id?: number | null
          agent_id?: number | null
          assigned_to?: string | null
          bang_don?: string | null
          booking_khach_san_id?: number | null
          booking_nha_hang_id?: number | null
          booking_status?: string | null
          chu_thich_khach?: string | null
          chuyen_bay_don?: string | null
          chuyen_bay_tien?: string | null
          co_tinh_suat_tl_nha_hang?: boolean | null
          created_at?: string | null
          created_by?: string | null
          dia_diem_id?: number | null
          file_chuong_trinh?: string | null
          ghi_chu?: string | null
          ghi_chu_dieu_tour?: string | null
          huong_dan_vien_id?: number | null
          huong_dan_vien_id_2?: number | null
          id?: never
          ks_escalate_level?: number
          loai_tour?: string | null
          ly_do_huy?: string | null
          ngay_di?: string | null
          ngay_ve?: string | null
          nh_escalate_level?: number
          seri_id?: number | null
          shopping?: boolean | null
          so_khach?: number | null
          so_khach_em1?: number | null
          so_khach_em2?: number | null
          so_khach_lon?: number | null
          so_khach_tl?: number | null
          tang_pham?: Json | null
          ten_doan?: string | null
          thi_truong?: string | null
          thu_tip?: boolean | null
          tip_lump_sum?: number | null
          tip_rate?: number | null
          tip_so_khach_override?: number | null
          tip_so_ngay_override?: number | null
          trang_thai?: string | null
          truong_doan?: string | null
          van_phong_id?: number | null
          xe_id?: number | null
        }
        Update: {
          agent_huy_id?: number | null
          agent_id?: number | null
          assigned_to?: string | null
          bang_don?: string | null
          booking_khach_san_id?: number | null
          booking_nha_hang_id?: number | null
          booking_status?: string | null
          chu_thich_khach?: string | null
          chuyen_bay_don?: string | null
          chuyen_bay_tien?: string | null
          co_tinh_suat_tl_nha_hang?: boolean | null
          created_at?: string | null
          created_by?: string | null
          dia_diem_id?: number | null
          file_chuong_trinh?: string | null
          ghi_chu?: string | null
          ghi_chu_dieu_tour?: string | null
          huong_dan_vien_id?: number | null
          huong_dan_vien_id_2?: number | null
          id?: never
          ks_escalate_level?: number
          loai_tour?: string | null
          ly_do_huy?: string | null
          ngay_di?: string | null
          ngay_ve?: string | null
          nh_escalate_level?: number
          seri_id?: number | null
          shopping?: boolean | null
          so_khach?: number | null
          so_khach_em1?: number | null
          so_khach_em2?: number | null
          so_khach_lon?: number | null
          so_khach_tl?: number | null
          tang_pham?: Json | null
          ten_doan?: string | null
          thi_truong?: string | null
          thu_tip?: boolean | null
          tip_lump_sum?: number | null
          tip_rate?: number | null
          tip_so_khach_override?: number | null
          tip_so_ngay_override?: number | null
          trang_thai?: string | null
          truong_doan?: string | null
          van_phong_id?: number | null
          xe_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "doan_agent_huy_id_fkey"
            columns: ["agent_huy_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "doan_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "doan_booking_khach_san_id_fkey"
            columns: ["booking_khach_san_id"]
            isOneToOne: false
            referencedRelation: "trang_thai"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "doan_booking_nha_hang_id_fkey"
            columns: ["booking_nha_hang_id"]
            isOneToOne: false
            referencedRelation: "trang_thai"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "doan_dia_diem_id_fkey"
            columns: ["dia_diem_id"]
            isOneToOne: false
            referencedRelation: "dia_diem"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "doan_huong_dan_vien_id_2_fkey"
            columns: ["huong_dan_vien_id_2"]
            isOneToOne: false
            referencedRelation: "huong_dan_vien"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "doan_huong_dan_vien_id_fkey"
            columns: ["huong_dan_vien_id"]
            isOneToOne: false
            referencedRelation: "huong_dan_vien"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "doan_seri_id_fkey"
            columns: ["seri_id"]
            isOneToOne: false
            referencedRelation: "seri_tour"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "doan_van_phong_id_fkey"
            columns: ["van_phong_id"]
            isOneToOne: false
            referencedRelation: "van_phong"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "doan_xe_id_fkey"
            columns: ["xe_id"]
            isOneToOne: false
            referencedRelation: "nha_xe_loai_xe"
            referencedColumns: ["id"]
          },
        ]
      }
      doan_booking_dv: {
        Row: {
          booking_status: string
          confirm_at: string | null
          created_at: string | null
          deadline: string | null
          deadline_done_at: string | null
          dich_vu_list: Json
          doan_id: number
          email_nha_cung_cap: string | null
          email_subject: string | null
          email_thread_id: string | null
          ghi_chu: string | null
          id: number
          mail_content_hash: string | null
          notified_at: string | null
          sent_at: string | null
          sent_by: string | null
          ten_nha_cung_cap: string
          updated_at: string | null
        }
        Insert: {
          booking_status?: string
          confirm_at?: string | null
          created_at?: string | null
          deadline?: string | null
          deadline_done_at?: string | null
          dich_vu_list?: Json
          doan_id: number
          email_nha_cung_cap?: string | null
          email_subject?: string | null
          email_thread_id?: string | null
          ghi_chu?: string | null
          id?: never
          mail_content_hash?: string | null
          notified_at?: string | null
          sent_at?: string | null
          sent_by?: string | null
          ten_nha_cung_cap: string
          updated_at?: string | null
        }
        Update: {
          booking_status?: string
          confirm_at?: string | null
          created_at?: string | null
          deadline?: string | null
          deadline_done_at?: string | null
          dich_vu_list?: Json
          doan_id?: number
          email_nha_cung_cap?: string | null
          email_subject?: string | null
          email_thread_id?: string | null
          ghi_chu?: string | null
          id?: never
          mail_content_hash?: string | null
          notified_at?: string | null
          sent_at?: string | null
          sent_by?: string | null
          ten_nha_cung_cap?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "doan_booking_dv_doan_id_fkey"
            columns: ["doan_id"]
            isOneToOne: false
            referencedRelation: "doan"
            referencedColumns: ["id"]
          },
        ]
      }
      doan_booking_ks: {
        Row: {
          chi_phi: number | null
          created_at: string | null
          deadline: string | null
          deadline_done_at: string | null
          doan_id: number
          email_subject: string | null
          email_thread_id: string | null
          id: number
          khach_san_id: number
          ks_dat_truoc: string | null
          ks_dat_truoc_confirm_at: string | null
          ks_dat_truoc_sent_at: string | null
          ks_dat_truoc_sent_by: string | null
          ks_dat_truoc_status: string
          ks_final: string | null
          ks_final_confirm_at: string | null
          ks_final_sent_at: string | null
          ks_final_sent_by: string | null
          ks_final_status: string
          ks_ghi_chu_booking: string | null
          ks_notified_at: string | null
          mail_content_hash: string | null
          ngay_snapshot: Json | null
        }
        Insert: {
          chi_phi?: number | null
          created_at?: string | null
          deadline?: string | null
          deadline_done_at?: string | null
          doan_id: number
          email_subject?: string | null
          email_thread_id?: string | null
          id?: never
          khach_san_id: number
          ks_dat_truoc?: string | null
          ks_dat_truoc_confirm_at?: string | null
          ks_dat_truoc_sent_at?: string | null
          ks_dat_truoc_sent_by?: string | null
          ks_dat_truoc_status?: string
          ks_final?: string | null
          ks_final_confirm_at?: string | null
          ks_final_sent_at?: string | null
          ks_final_sent_by?: string | null
          ks_final_status?: string
          ks_ghi_chu_booking?: string | null
          ks_notified_at?: string | null
          mail_content_hash?: string | null
          ngay_snapshot?: Json | null
        }
        Update: {
          chi_phi?: number | null
          created_at?: string | null
          deadline?: string | null
          deadline_done_at?: string | null
          doan_id?: number
          email_subject?: string | null
          email_thread_id?: string | null
          id?: never
          khach_san_id?: number
          ks_dat_truoc?: string | null
          ks_dat_truoc_confirm_at?: string | null
          ks_dat_truoc_sent_at?: string | null
          ks_dat_truoc_sent_by?: string | null
          ks_dat_truoc_status?: string
          ks_final?: string | null
          ks_final_confirm_at?: string | null
          ks_final_sent_at?: string | null
          ks_final_sent_by?: string | null
          ks_final_status?: string
          ks_ghi_chu_booking?: string | null
          ks_notified_at?: string | null
          mail_content_hash?: string | null
          ngay_snapshot?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "doan_booking_ks_doan_id_fkey"
            columns: ["doan_id"]
            isOneToOne: false
            referencedRelation: "doan"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "doan_booking_ks_khach_san_id_fkey"
            columns: ["khach_san_id"]
            isOneToOne: false
            referencedRelation: "khach_san"
            referencedColumns: ["id"]
          },
        ]
      }
      doan_booking_nh: {
        Row: {
          booking_status: string
          bua_an: string
          confirm_at: string | null
          created_at: string | null
          dat_truoc_confirm_at: string | null
          dat_truoc_sent_at: string | null
          dat_truoc_sent_by: string | null
          dat_truoc_status: string | null
          deadline: string | null
          deadline_done_at: string | null
          doan_id: number
          doan_ngay_id: number
          don_vi_snapshot: string | null
          email_subject: string | null
          email_thread_id: string | null
          final_confirm_at: string | null
          final_sent_at: string | null
          final_sent_by: string | null
          final_status: string | null
          ghi_chu: string | null
          gia_snapshot: number | null
          id: number
          mail_content_hash: string | null
          mail_sent_snapshot: Json | null
          mon_an_snapshot: Json | null
          nha_hang_id: number | null
          sent_at: string | null
          sent_by: string | null
          set_menu_id: number | null
          ten_set_snapshot: string | null
        }
        Insert: {
          booking_status?: string
          bua_an: string
          confirm_at?: string | null
          created_at?: string | null
          dat_truoc_confirm_at?: string | null
          dat_truoc_sent_at?: string | null
          dat_truoc_sent_by?: string | null
          dat_truoc_status?: string | null
          deadline?: string | null
          deadline_done_at?: string | null
          doan_id: number
          doan_ngay_id: number
          don_vi_snapshot?: string | null
          email_subject?: string | null
          email_thread_id?: string | null
          final_confirm_at?: string | null
          final_sent_at?: string | null
          final_sent_by?: string | null
          final_status?: string | null
          ghi_chu?: string | null
          gia_snapshot?: number | null
          id?: never
          mail_content_hash?: string | null
          mail_sent_snapshot?: Json | null
          mon_an_snapshot?: Json | null
          nha_hang_id?: number | null
          sent_at?: string | null
          sent_by?: string | null
          set_menu_id?: number | null
          ten_set_snapshot?: string | null
        }
        Update: {
          booking_status?: string
          bua_an?: string
          confirm_at?: string | null
          created_at?: string | null
          dat_truoc_confirm_at?: string | null
          dat_truoc_sent_at?: string | null
          dat_truoc_sent_by?: string | null
          dat_truoc_status?: string | null
          deadline?: string | null
          deadline_done_at?: string | null
          doan_id?: number
          doan_ngay_id?: number
          don_vi_snapshot?: string | null
          email_subject?: string | null
          email_thread_id?: string | null
          final_confirm_at?: string | null
          final_sent_at?: string | null
          final_sent_by?: string | null
          final_status?: string | null
          ghi_chu?: string | null
          gia_snapshot?: number | null
          id?: never
          mail_content_hash?: string | null
          mail_sent_snapshot?: Json | null
          mon_an_snapshot?: Json | null
          nha_hang_id?: number | null
          sent_at?: string | null
          sent_by?: string | null
          set_menu_id?: number | null
          ten_set_snapshot?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "doan_booking_nh_doan_id_fkey"
            columns: ["doan_id"]
            isOneToOne: false
            referencedRelation: "doan"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "doan_booking_nh_doan_ngay_id_fkey"
            columns: ["doan_ngay_id"]
            isOneToOne: false
            referencedRelation: "doan_ngay"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "doan_booking_nh_nha_hang_id_fkey"
            columns: ["nha_hang_id"]
            isOneToOne: false
            referencedRelation: "nha_hang"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "doan_booking_nh_set_menu_id_fkey"
            columns: ["set_menu_id"]
            isOneToOne: false
            referencedRelation: "nha_hang_set_menu"
            referencedColumns: ["id"]
          },
        ]
      }
      doan_booking_visa: {
        Row: {
          booking_status: string
          confirm_at: string | null
          deadline: string | null
          doan_id: number
          don_vi_visa_id: number | null
          email_thread_id: string | null
          ghi_chu: string | null
          id: number
          mail_content_hash: string | null
          sent_at: string | null
          sent_by: string | null
          updated_at: string | null
        }
        Insert: {
          booking_status?: string
          confirm_at?: string | null
          deadline?: string | null
          doan_id: number
          don_vi_visa_id?: number | null
          email_thread_id?: string | null
          ghi_chu?: string | null
          id?: never
          mail_content_hash?: string | null
          sent_at?: string | null
          sent_by?: string | null
          updated_at?: string | null
        }
        Update: {
          booking_status?: string
          confirm_at?: string | null
          deadline?: string | null
          doan_id?: number
          don_vi_visa_id?: number | null
          email_thread_id?: string | null
          ghi_chu?: string | null
          id?: never
          mail_content_hash?: string | null
          sent_at?: string | null
          sent_by?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "doan_booking_visa_doan_id_fkey"
            columns: ["doan_id"]
            isOneToOne: false
            referencedRelation: "doan"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "doan_booking_visa_don_vi_visa_id_fkey"
            columns: ["don_vi_visa_id"]
            isOneToOne: false
            referencedRelation: "don_vi_visa"
            referencedColumns: ["id"]
          },
        ]
      }
      doan_booking_xe: {
        Row: {
          booking_status: string
          confirm_at: string | null
          deadline: string | null
          doan_id: number
          email_thread_id: string | null
          ghi_chu: string | null
          id: number
          mail_content_hash: string | null
          sent_at: string | null
          sent_by: string | null
          updated_at: string | null
        }
        Insert: {
          booking_status?: string
          confirm_at?: string | null
          deadline?: string | null
          doan_id: number
          email_thread_id?: string | null
          ghi_chu?: string | null
          id?: never
          mail_content_hash?: string | null
          sent_at?: string | null
          sent_by?: string | null
          updated_at?: string | null
        }
        Update: {
          booking_status?: string
          confirm_at?: string | null
          deadline?: string | null
          doan_id?: number
          email_thread_id?: string | null
          ghi_chu?: string | null
          id?: never
          mail_content_hash?: string | null
          sent_at?: string | null
          sent_by?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "doan_booking_xe_doan_id_fkey"
            columns: ["doan_id"]
            isOneToOne: true
            referencedRelation: "doan"
            referencedColumns: ["id"]
          },
        ]
      }
      doan_chi_phi: {
        Row: {
          chiet_khau_pct: number | null
          chiet_khau_phan_tram_snapshot: number | null
          created_at: string | null
          danh_muc: string | null
          de_nghi_tt_id: number | null
          doan_id: number | null
          don_gia: number | null
          don_gia_raw: number | null
          foc_count: number
          foc_khach_snapshot: number | null
          foc_mien_snapshot: number | null
          id: number
          is_excluded: boolean
          is_overridden: boolean
          loai: string
          loai_row: string | null
          mo_ta: string | null
          ngay_so: number | null
          ngay_thanh_toan: string | null
          nha_cung_cap_id: number | null
          ref_doan_ngay_id: number | null
          ref_doan_ngay_item_id: number | null
          so_luong: number | null
          so_tien_da_dntt: number | null
          so_tien_da_tt: number | null
          thanh_tien: number | null
          thanh_tien_thuc_te: number | null
          thanh_toan_dinh_ky: boolean | null
          tien_cong_ty: number | null
          tien_hdv: number | null
          tien_te_loai: string | null
          trang_thai_dntt: string | null
          trang_thai_thanh_toan: string | null
          ty_gia: number | null
        }
        Insert: {
          chiet_khau_pct?: number | null
          chiet_khau_phan_tram_snapshot?: number | null
          created_at?: string | null
          danh_muc?: string | null
          de_nghi_tt_id?: number | null
          doan_id?: number | null
          don_gia?: number | null
          don_gia_raw?: number | null
          foc_count?: number
          foc_khach_snapshot?: number | null
          foc_mien_snapshot?: number | null
          id?: number
          is_excluded?: boolean
          is_overridden?: boolean
          loai: string
          loai_row?: string | null
          mo_ta?: string | null
          ngay_so?: number | null
          ngay_thanh_toan?: string | null
          nha_cung_cap_id?: number | null
          ref_doan_ngay_id?: number | null
          ref_doan_ngay_item_id?: number | null
          so_luong?: number | null
          so_tien_da_dntt?: number | null
          so_tien_da_tt?: number | null
          thanh_tien?: number | null
          thanh_tien_thuc_te?: number | null
          thanh_toan_dinh_ky?: boolean | null
          tien_cong_ty?: number | null
          tien_hdv?: number | null
          tien_te_loai?: string | null
          trang_thai_dntt?: string | null
          trang_thai_thanh_toan?: string | null
          ty_gia?: number | null
        }
        Update: {
          chiet_khau_pct?: number | null
          chiet_khau_phan_tram_snapshot?: number | null
          created_at?: string | null
          danh_muc?: string | null
          de_nghi_tt_id?: number | null
          doan_id?: number | null
          don_gia?: number | null
          don_gia_raw?: number | null
          foc_count?: number
          foc_khach_snapshot?: number | null
          foc_mien_snapshot?: number | null
          id?: number
          is_excluded?: boolean
          is_overridden?: boolean
          loai?: string
          loai_row?: string | null
          mo_ta?: string | null
          ngay_so?: number | null
          ngay_thanh_toan?: string | null
          nha_cung_cap_id?: number | null
          ref_doan_ngay_id?: number | null
          ref_doan_ngay_item_id?: number | null
          so_luong?: number | null
          so_tien_da_dntt?: number | null
          so_tien_da_tt?: number | null
          thanh_tien?: number | null
          thanh_tien_thuc_te?: number | null
          thanh_toan_dinh_ky?: boolean | null
          tien_cong_ty?: number | null
          tien_hdv?: number | null
          tien_te_loai?: string | null
          trang_thai_dntt?: string | null
          trang_thai_thanh_toan?: string | null
          ty_gia?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "doan_chi_phi_de_nghi_tt_id_fkey"
            columns: ["de_nghi_tt_id"]
            isOneToOne: false
            referencedRelation: "de_nghi_thanh_toan"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "doan_chi_phi_de_nghi_tt_id_fkey"
            columns: ["de_nghi_tt_id"]
            isOneToOne: false
            referencedRelation: "dntt_with_payment_status"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "doan_chi_phi_doan_id_fkey"
            columns: ["doan_id"]
            isOneToOne: false
            referencedRelation: "doan"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "doan_chi_phi_nha_cung_cap_id_fkey"
            columns: ["nha_cung_cap_id"]
            isOneToOne: false
            referencedRelation: "nha_cung_cap"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "doan_chi_phi_ref_doan_ngay_id_fkey"
            columns: ["ref_doan_ngay_id"]
            isOneToOne: false
            referencedRelation: "doan_ngay"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "doan_chi_phi_ref_doan_ngay_item_id_fkey"
            columns: ["ref_doan_ngay_item_id"]
            isOneToOne: false
            referencedRelation: "doan_ngay_item"
            referencedColumns: ["id"]
          },
        ]
      }
      doan_invoice: {
        Row: {
          currency: string
          doan_id: number
          ghi_chu: string | null
          id: number
          invoice_files: Json | null
          so_tien_thu: number | null
          updated_at: string | null
        }
        Insert: {
          currency?: string
          doan_id: number
          ghi_chu?: string | null
          id?: never
          invoice_files?: Json | null
          so_tien_thu?: number | null
          updated_at?: string | null
        }
        Update: {
          currency?: string
          doan_id?: number
          ghi_chu?: string | null
          id?: never
          invoice_files?: Json | null
          so_tien_thu?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "doan_invoice_doan_id_fkey"
            columns: ["doan_id"]
            isOneToOne: true
            referencedRelation: "doan"
            referencedColumns: ["id"]
          },
        ]
      }
      doan_ks_dem: {
        Row: {
          booking_ks_id: number
          created_at: string | null
          doan_id: number
          gia_phong: number
          id: number
          loai_phong: string | null
          ngay_date: string | null
          so_phong: number
        }
        Insert: {
          booking_ks_id: number
          created_at?: string | null
          doan_id: number
          gia_phong?: number
          id?: number
          loai_phong?: string | null
          ngay_date?: string | null
          so_phong?: number
        }
        Update: {
          booking_ks_id?: number
          created_at?: string | null
          doan_id?: number
          gia_phong?: number
          id?: number
          loai_phong?: string | null
          ngay_date?: string | null
          so_phong?: number
        }
        Relationships: [
          {
            foreignKeyName: "doan_ks_dem_booking_ks_id_fkey"
            columns: ["booking_ks_id"]
            isOneToOne: false
            referencedRelation: "doan_booking_ks"
            referencedColumns: ["id"]
          },
        ]
      }
      doan_log: {
        Row: {
          created_at: string | null
          created_by: string | null
          created_by_ten: string | null
          doan_id: number
          id: number
          is_resolved: boolean | null
          loai: string
          noi_dung: string | null
          resolved_at: string | null
          resolved_by: string | null
          resolved_by_ten: string | null
          so_tien: number | null
          tieu_de: string
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          created_by_ten?: string | null
          doan_id: number
          id?: never
          is_resolved?: boolean | null
          loai: string
          noi_dung?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          resolved_by_ten?: string | null
          so_tien?: number | null
          tieu_de: string
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          created_by_ten?: string | null
          doan_id?: number
          id?: never
          is_resolved?: boolean | null
          loai?: string
          noi_dung?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          resolved_by_ten?: string | null
          so_tien?: number | null
          tieu_de?: string
        }
        Relationships: [
          {
            foreignKeyName: "doan_log_doan_id_fkey"
            columns: ["doan_id"]
            isOneToOne: false
            referencedRelation: "doan"
            referencedColumns: ["id"]
          },
        ]
      }
      doan_ngay: {
        Row: {
          an_toi_ghi_chu: string | null
          an_toi_nha_hang_id: number | null
          an_toi_set_menu_id: number | null
          an_toi_so_khach: number | null
          an_trua_ghi_chu: string | null
          an_trua_nha_hang_id: number | null
          an_trua_set_menu_id: number | null
          an_trua_so_khach: number | null
          created_at: string | null
          doan_id: number | null
          doan_nhom_id: number
          id: number
          khach_san_id: number | null
          ks_loai_phong: string | null
          ks_ma_code: string | null
          ngay_date: string | null
          ngay_so: number
          thanh_pho: string | null
          thu: string | null
          updated_at: string | null
        }
        Insert: {
          an_toi_ghi_chu?: string | null
          an_toi_nha_hang_id?: number | null
          an_toi_set_menu_id?: number | null
          an_toi_so_khach?: number | null
          an_trua_ghi_chu?: string | null
          an_trua_nha_hang_id?: number | null
          an_trua_set_menu_id?: number | null
          an_trua_so_khach?: number | null
          created_at?: string | null
          doan_id?: number | null
          doan_nhom_id: number
          id?: number
          khach_san_id?: number | null
          ks_loai_phong?: string | null
          ks_ma_code?: string | null
          ngay_date?: string | null
          ngay_so: number
          thanh_pho?: string | null
          thu?: string | null
          updated_at?: string | null
        }
        Update: {
          an_toi_ghi_chu?: string | null
          an_toi_nha_hang_id?: number | null
          an_toi_set_menu_id?: number | null
          an_toi_so_khach?: number | null
          an_trua_ghi_chu?: string | null
          an_trua_nha_hang_id?: number | null
          an_trua_set_menu_id?: number | null
          an_trua_so_khach?: number | null
          created_at?: string | null
          doan_id?: number | null
          doan_nhom_id?: number
          id?: number
          khach_san_id?: number | null
          ks_loai_phong?: string | null
          ks_ma_code?: string | null
          ngay_date?: string | null
          ngay_so?: number
          thanh_pho?: string | null
          thu?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "doan_ngay_an_toi_nha_hang_id_fkey"
            columns: ["an_toi_nha_hang_id"]
            isOneToOne: false
            referencedRelation: "nha_hang"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "doan_ngay_an_trua_nha_hang_id_fkey"
            columns: ["an_trua_nha_hang_id"]
            isOneToOne: false
            referencedRelation: "nha_hang"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "doan_ngay_doan_id_fkey"
            columns: ["doan_id"]
            isOneToOne: false
            referencedRelation: "doan"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "doan_ngay_doan_nhom_id_fkey"
            columns: ["doan_nhom_id"]
            isOneToOne: false
            referencedRelation: "doan_nhom"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "doan_ngay_khach_san_id_fkey"
            columns: ["khach_san_id"]
            isOneToOne: false
            referencedRelation: "khach_san"
            referencedColumns: ["id"]
          },
        ]
      }
      doan_nhom: {
        Row: {
          created_at: string
          doan_id: number
          ghi_chu: string | null
          hdv_id: number | null
          id: number
          so_khach_em1: number | null
          so_khach_em2: number | null
          so_khach_lon: number | null
          so_khach_tl: number | null
          ten_nhom: string
          thu_tu: number
          updated_at: string
          xe_id: number | null
        }
        Insert: {
          created_at?: string
          doan_id: number
          ghi_chu?: string | null
          hdv_id?: number | null
          id?: number
          so_khach_em1?: number | null
          so_khach_em2?: number | null
          so_khach_lon?: number | null
          so_khach_tl?: number | null
          ten_nhom: string
          thu_tu?: number
          updated_at?: string
          xe_id?: number | null
        }
        Update: {
          created_at?: string
          doan_id?: number
          ghi_chu?: string | null
          hdv_id?: number | null
          id?: number
          so_khach_em1?: number | null
          so_khach_em2?: number | null
          so_khach_lon?: number | null
          so_khach_tl?: number | null
          ten_nhom?: string
          thu_tu?: number
          updated_at?: string
          xe_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "doan_nhom_doan_id_fkey"
            columns: ["doan_id"]
            isOneToOne: false
            referencedRelation: "doan"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "doan_nhom_hdv_id_fkey"
            columns: ["hdv_id"]
            isOneToOne: false
            referencedRelation: "huong_dan_vien"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "doan_nhom_xe_id_fkey"
            columns: ["xe_id"]
            isOneToOne: false
            referencedRelation: "nha_xe_loai_xe"
            referencedColumns: ["id"]
          },
        ]
      }
      doan_ngay_item: {
        Row: {
          canh_diem_id: number | null
          co_phi: boolean | null
          created_at: string | null
          doan_id: number | null
          doan_ngay_id: number | null
          don_gia: number | null
          ghi_chu: string | null
          id: number
          nguoi_thanh_toan: string | null
          so_luong: number | null
          thanh_tien: number | null
          thu_tu: number | null
          trang_thai: string | null
        }
        Insert: {
          canh_diem_id?: number | null
          co_phi?: boolean | null
          created_at?: string | null
          doan_id?: number | null
          doan_ngay_id?: number | null
          don_gia?: number | null
          ghi_chu?: string | null
          id?: number
          nguoi_thanh_toan?: string | null
          so_luong?: number | null
          thanh_tien?: number | null
          thu_tu?: number | null
          trang_thai?: string | null
        }
        Update: {
          canh_diem_id?: number | null
          co_phi?: boolean | null
          created_at?: string | null
          doan_id?: number | null
          doan_ngay_id?: number | null
          don_gia?: number | null
          ghi_chu?: string | null
          id?: number
          nguoi_thanh_toan?: string | null
          so_luong?: number | null
          thanh_tien?: number | null
          thu_tu?: number | null
          trang_thai?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "doan_ngay_item_canh_diem_id_fkey"
            columns: ["canh_diem_id"]
            isOneToOne: false
            referencedRelation: "canh_diem"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "doan_ngay_item_doan_id_fkey"
            columns: ["doan_id"]
            isOneToOne: false
            referencedRelation: "doan"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "doan_ngay_item_doan_ngay_id_fkey"
            columns: ["doan_ngay_id"]
            isOneToOne: false
            referencedRelation: "doan_ngay"
            referencedColumns: ["id"]
          },
        ]
      }
      doan_permissions: {
        Row: {
          created_at: string | null
          doan_id: number | null
          ho_ten: string | null
          id: number
          quyen: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          doan_id?: number | null
          ho_ten?: string | null
          id?: number
          quyen?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          doan_id?: number | null
          ho_ten?: string | null
          id?: number
          quyen?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "doan_permissions_doan_id_fkey"
            columns: ["doan_id"]
            isOneToOne: false
            referencedRelation: "doan"
            referencedColumns: ["id"]
          },
        ]
      }
      doan_tai_lieu: {
        Row: {
          doan_id: number
          file_name: string | null
          file_url: string
          id: number
          loai: string
          uploaded_at: string
          uploaded_by: string | null
        }
        Insert: {
          doan_id: number
          file_name?: string | null
          file_url: string
          id?: number
          loai: string
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Update: {
          doan_id?: number
          file_name?: string | null
          file_url?: string
          id?: number
          loai?: string
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "doan_tai_lieu_doan_id_fkey"
            columns: ["doan_id"]
            isOneToOne: false
            referencedRelation: "doan"
            referencedColumns: ["id"]
          },
        ]
      }
      don_vi_visa: {
        Row: {
          created_at: string
          dia_chi: string | null
          email: string | null
          ghi_chu: string | null
          id: number
          nha_cung_cap_id: number | null
          so_dien_thoai: string | null
          tai_khoan_thanh_toan: string | null
          ten: string
        }
        Insert: {
          created_at?: string
          dia_chi?: string | null
          email?: string | null
          ghi_chu?: string | null
          id?: number
          nha_cung_cap_id?: number | null
          so_dien_thoai?: string | null
          tai_khoan_thanh_toan?: string | null
          ten: string
        }
        Update: {
          created_at?: string
          dia_chi?: string | null
          email?: string | null
          ghi_chu?: string | null
          id?: number
          nha_cung_cap_id?: number | null
          so_dien_thoai?: string | null
          tai_khoan_thanh_toan?: string | null
          ten?: string
        }
        Relationships: [
          {
            foreignKeyName: "don_vi_visa_nha_cung_cap_id_fkey"
            columns: ["nha_cung_cap_id"]
            isOneToOne: false
            referencedRelation: "nha_cung_cap"
            referencedColumns: ["id"]
          },
        ]
      }
      huong_dan_vien: {
        Row: {
          active: boolean
          agent_ids: number[] | null
          bac: number
          chuyen_mon: string | null
          dia_diem_ids: number[]
          ghi_chu: string | null
          gioi_tinh: string | null
          id: number
          kinh_nghiem: string | null
          nam_sinh: number | null
          ngan_hang: string | null
          so_dien_thoai: string | null
          so_tai_khoan: string | null
          ten: string | null
        }
        Insert: {
          active?: boolean
          agent_ids?: number[] | null
          bac?: number
          chuyen_mon?: string | null
          dia_diem_ids?: number[]
          ghi_chu?: string | null
          gioi_tinh?: string | null
          id?: never
          kinh_nghiem?: string | null
          nam_sinh?: number | null
          ngan_hang?: string | null
          so_dien_thoai?: string | null
          so_tai_khoan?: string | null
          ten?: string | null
        }
        Update: {
          active?: boolean
          agent_ids?: number[] | null
          bac?: number
          chuyen_mon?: string | null
          dia_diem_ids?: number[]
          ghi_chu?: string | null
          gioi_tinh?: string | null
          id?: never
          kinh_nghiem?: string | null
          nam_sinh?: number | null
          ngan_hang?: string | null
          so_dien_thoai?: string | null
          so_tai_khoan?: string | null
          ten?: string | null
        }
        Relationships: []
      }
      khach_san: {
        Row: {
          created_at: string | null
          dia_chi: string | null
          dia_diem: string | null
          dia_diem_zh: string | null
          email: string | null
          foc_khach: number | null
          foc_mien: number | null
          id: number
          nguoi_thanh_toan: string | null
          nha_cung_cap_id: number | null
          so_dien_thoai: string | null
          tai_khoan_thanh_toan: string | null
          ten: string | null
          ten_zh: string | null
          thong_tin_chung: string | null
          website: string | null
        }
        Insert: {
          created_at?: string | null
          dia_chi?: string | null
          dia_diem?: string | null
          dia_diem_zh?: string | null
          email?: string | null
          foc_khach?: number | null
          foc_mien?: number | null
          id?: never
          nguoi_thanh_toan?: string | null
          nha_cung_cap_id?: number | null
          so_dien_thoai?: string | null
          tai_khoan_thanh_toan?: string | null
          ten?: string | null
          ten_zh?: string | null
          thong_tin_chung?: string | null
          website?: string | null
        }
        Update: {
          created_at?: string | null
          dia_chi?: string | null
          dia_diem?: string | null
          dia_diem_zh?: string | null
          email?: string | null
          foc_khach?: number | null
          foc_mien?: number | null
          id?: never
          nguoi_thanh_toan?: string | null
          nha_cung_cap_id?: number | null
          so_dien_thoai?: string | null
          tai_khoan_thanh_toan?: string | null
          ten?: string | null
          ten_zh?: string | null
          thong_tin_chung?: string | null
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "khach_san_nha_cung_cap_id_fkey"
            columns: ["nha_cung_cap_id"]
            isOneToOne: false
            referencedRelation: "nha_cung_cap"
            referencedColumns: ["id"]
          },
        ]
      }
      lead: {
        Row: {
          assigned_to: string | null
          campaign_id: number | null
          chuc_vu: string | null
          created_at: string | null
          created_by: string | null
          do_not_contact: boolean | null
          do_not_contact_reason: string | null
          doan_id: number | null
          email: string | null
          facebook_url: string | null
          ghi_chu: string | null
          ho_ten: string
          id: number
          last_touched_at: string | null
          loai_khach: string | null
          loai_tour: string
          ly_do_mat: string | null
          ngan_sach_per_khach: number | null
          ngay_di_du_kien: string | null
          ngay_follow_up_tiep: string | null
          ngay_lien_he_cuoi: string | null
          ngay_ve_du_kien: string | null
          nguon: string
          phong_cach: string | null
          referral_lead_id: number | null
          so_dien_thoai: string | null
          so_ngay: number | null
          so_nguoi_em: number | null
          so_nguoi_lon: number | null
          ten_to_chuc: string | null
          thang_du_kien: string | null
          total_touches: number | null
          trang_thai: string
          updated_at: string | null
          uu_tien: string | null
          yeu_cau_dac_biet: string | null
        }
        Insert: {
          assigned_to?: string | null
          campaign_id?: number | null
          chuc_vu?: string | null
          created_at?: string | null
          created_by?: string | null
          do_not_contact?: boolean | null
          do_not_contact_reason?: string | null
          doan_id?: number | null
          email?: string | null
          facebook_url?: string | null
          ghi_chu?: string | null
          ho_ten: string
          id?: never
          last_touched_at?: string | null
          loai_khach?: string | null
          loai_tour: string
          ly_do_mat?: string | null
          ngan_sach_per_khach?: number | null
          ngay_di_du_kien?: string | null
          ngay_follow_up_tiep?: string | null
          ngay_lien_he_cuoi?: string | null
          ngay_ve_du_kien?: string | null
          nguon: string
          phong_cach?: string | null
          referral_lead_id?: number | null
          so_dien_thoai?: string | null
          so_ngay?: number | null
          so_nguoi_em?: number | null
          so_nguoi_lon?: number | null
          ten_to_chuc?: string | null
          thang_du_kien?: string | null
          total_touches?: number | null
          trang_thai?: string
          updated_at?: string | null
          uu_tien?: string | null
          yeu_cau_dac_biet?: string | null
        }
        Update: {
          assigned_to?: string | null
          campaign_id?: number | null
          chuc_vu?: string | null
          created_at?: string | null
          created_by?: string | null
          do_not_contact?: boolean | null
          do_not_contact_reason?: string | null
          doan_id?: number | null
          email?: string | null
          facebook_url?: string | null
          ghi_chu?: string | null
          ho_ten?: string
          id?: never
          last_touched_at?: string | null
          loai_khach?: string | null
          loai_tour?: string
          ly_do_mat?: string | null
          ngan_sach_per_khach?: number | null
          ngay_di_du_kien?: string | null
          ngay_follow_up_tiep?: string | null
          ngay_lien_he_cuoi?: string | null
          ngay_ve_du_kien?: string | null
          nguon?: string
          phong_cach?: string | null
          referral_lead_id?: number | null
          so_dien_thoai?: string | null
          so_ngay?: number | null
          so_nguoi_em?: number | null
          so_nguoi_lon?: number | null
          ten_to_chuc?: string | null
          thang_du_kien?: string | null
          total_touches?: number | null
          trang_thai?: string
          updated_at?: string | null
          uu_tien?: string | null
          yeu_cau_dac_biet?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "lead_campaign"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_doan_id_fkey"
            columns: ["doan_id"]
            isOneToOne: false
            referencedRelation: "doan"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_referral_lead_id_fkey"
            columns: ["referral_lead_id"]
            isOneToOne: false
            referencedRelation: "lead"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_activity: {
        Row: {
          channel: string | null
          channel_ref: string | null
          created_at: string | null
          created_by: string | null
          direction: string | null
          duration_seconds: number | null
          id: number
          ket_qua: string | null
          lead_id: number
          loai: string
          next_action_id: number | null
          noi_dung: string | null
          outcome: string | null
          template_id: number | null
          tep_dinh_kem: Json | null
          trang_thai_cu: string | null
          trang_thai_moi: string | null
        }
        Insert: {
          channel?: string | null
          channel_ref?: string | null
          created_at?: string | null
          created_by?: string | null
          direction?: string | null
          duration_seconds?: number | null
          id?: never
          ket_qua?: string | null
          lead_id: number
          loai: string
          next_action_id?: number | null
          noi_dung?: string | null
          outcome?: string | null
          template_id?: number | null
          tep_dinh_kem?: Json | null
          trang_thai_cu?: string | null
          trang_thai_moi?: string | null
        }
        Update: {
          channel?: string | null
          channel_ref?: string | null
          created_at?: string | null
          created_by?: string | null
          direction?: string | null
          duration_seconds?: number | null
          id?: never
          ket_qua?: string | null
          lead_id?: number
          loai?: string
          next_action_id?: number | null
          noi_dung?: string | null
          outcome?: string | null
          template_id?: number | null
          tep_dinh_kem?: Json | null
          trang_thai_cu?: string | null
          trang_thai_moi?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_activity_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "lead"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_activity_next_action_id_fkey"
            columns: ["next_action_id"]
            isOneToOne: false
            referencedRelation: "lead_next_action"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_activity_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "lead_template"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_cadence: {
        Row: {
          active: boolean | null
          channel: string
          id: number
          max_touches: number
          offset_hours: number
          priority: string
          reason_tpl: string | null
          stage: string
          step_no: number
        }
        Insert: {
          active?: boolean | null
          channel: string
          id?: number
          max_touches: number
          offset_hours: number
          priority?: string
          reason_tpl?: string | null
          stage: string
          step_no: number
        }
        Update: {
          active?: boolean | null
          channel?: string
          id?: number
          max_touches?: number
          offset_hours?: number
          priority?: string
          reason_tpl?: string | null
          stage?: string
          step_no?: number
        }
        Relationships: []
      }
      lead_campaign: {
        Row: {
          active: boolean | null
          created_at: string | null
          ghi_chu: string | null
          id: number
          loai_tour: string | null
          ngan_sach: number | null
          ngay_bat_dau: string | null
          ngay_ket_thuc: string | null
          nguon: string | null
          ten: string
        }
        Insert: {
          active?: boolean | null
          created_at?: string | null
          ghi_chu?: string | null
          id?: never
          loai_tour?: string | null
          ngan_sach?: number | null
          ngay_bat_dau?: string | null
          ngay_ket_thuc?: string | null
          nguon?: string | null
          ten: string
        }
        Update: {
          active?: boolean | null
          created_at?: string | null
          ghi_chu?: string | null
          id?: never
          loai_tour?: string | null
          ngan_sach?: number | null
          ngay_bat_dau?: string | null
          ngay_ket_thuc?: string | null
          nguon?: string | null
          ten?: string
        }
        Relationships: []
      }
      lead_diem_den: {
        Row: {
          created_at: string | null
          diem_den: string
          id: number
          lead_id: number
        }
        Insert: {
          created_at?: string | null
          diem_den: string
          id?: never
          lead_id: number
        }
        Update: {
          created_at?: string | null
          diem_den?: string
          id?: never
          lead_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "lead_diem_den_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "lead"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_next_action: {
        Row: {
          channel: string
          created_at: string | null
          created_by: string | null
          done_at: string | null
          due_at: string
          id: number
          lead_id: number
          outcome: string | null
          outcome_note: string | null
          priority: string
          reason: string | null
          source: string
          status: string
          suggested_script: string | null
        }
        Insert: {
          channel: string
          created_at?: string | null
          created_by?: string | null
          done_at?: string | null
          due_at: string
          id?: number
          lead_id: number
          outcome?: string | null
          outcome_note?: string | null
          priority?: string
          reason?: string | null
          source?: string
          status?: string
          suggested_script?: string | null
        }
        Update: {
          channel?: string
          created_at?: string | null
          created_by?: string | null
          done_at?: string | null
          due_at?: string
          id?: number
          lead_id?: number
          outcome?: string | null
          outcome_note?: string | null
          priority?: string
          reason?: string | null
          source?: string
          status?: string
          suggested_script?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_next_action_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "lead"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_task: {
        Row: {
          assigned_to: string | null
          created_at: string | null
          created_by: string | null
          deadline: string | null
          hoan_thanh: boolean | null
          hoan_thanh_luc: string | null
          id: number
          lead_id: number
          mo_ta: string
        }
        Insert: {
          assigned_to?: string | null
          created_at?: string | null
          created_by?: string | null
          deadline?: string | null
          hoan_thanh?: boolean | null
          hoan_thanh_luc?: string | null
          id?: never
          lead_id: number
          mo_ta: string
        }
        Update: {
          assigned_to?: string | null
          created_at?: string | null
          created_by?: string | null
          deadline?: string | null
          hoan_thanh?: boolean | null
          hoan_thanh_luc?: string | null
          id?: never
          lead_id?: number
          mo_ta?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_task_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "lead"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_template: {
        Row: {
          active: boolean | null
          body: string
          channel: string
          conversion_rate: number | null
          created_at: string | null
          id: number
          scenario: string | null
          stage: string | null
          subject: string | null
          ten: string
          used_count: number | null
        }
        Insert: {
          active?: boolean | null
          body: string
          channel: string
          conversion_rate?: number | null
          created_at?: string | null
          id?: number
          scenario?: string | null
          stage?: string | null
          subject?: string | null
          ten: string
          used_count?: number | null
        }
        Update: {
          active?: boolean | null
          body?: string
          channel?: string
          conversion_rate?: number | null
          created_at?: string | null
          id?: number
          scenario?: string | null
          stage?: string | null
          subject?: string | null
          ten?: string
          used_count?: number | null
        }
        Relationships: []
      }
      loai_visa: {
        Row: {
          created_at: string
          don_vi: string | null
          don_vi_visa_id: number
          ghi_chu: string | null
          gia: number | null
          id: number
          loai: string | null
          quoc_gia: string
          thoi_han: string | null
        }
        Insert: {
          created_at?: string
          don_vi?: string | null
          don_vi_visa_id: number
          ghi_chu?: string | null
          gia?: number | null
          id?: number
          loai?: string | null
          quoc_gia: string
          thoi_han?: string | null
        }
        Update: {
          created_at?: string
          don_vi?: string | null
          don_vi_visa_id?: number
          ghi_chu?: string | null
          gia?: number | null
          id?: number
          loai?: string | null
          quoc_gia?: string
          thoi_han?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "loai_visa_don_vi_visa_id_fkey"
            columns: ["don_vi_visa_id"]
            isOneToOne: false
            referencedRelation: "don_vi_visa"
            referencedColumns: ["id"]
          },
        ]
      }
      lock_phong: {
        Row: {
          created_at: string | null
          created_by: string | null
          deadline: string | null
          ghi_chu: string | null
          id: number
          ngay_xuat_phat: string
          seri_id: number | null
          ten_doan: string
          ten_seri: string
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          deadline?: string | null
          ghi_chu?: string | null
          id?: number
          ngay_xuat_phat: string
          seri_id?: number | null
          ten_doan: string
          ten_seri: string
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          deadline?: string | null
          ghi_chu?: string | null
          id?: number
          ngay_xuat_phat?: string
          seri_id?: number | null
          ten_doan?: string
          ten_seri?: string
        }
        Relationships: [
          {
            foreignKeyName: "lock_phong_seri_id_fkey"
            columns: ["seri_id"]
            isOneToOne: false
            referencedRelation: "seri_tour"
            referencedColumns: ["id"]
          },
        ]
      }
      lock_phong_ks: {
        Row: {
          check_in: string
          check_out: string
          code_doan_thanh: string | null
          code_ncc: string | null
          created_at: string | null
          email_confirm_at: string | null
          email_sent_at: string | null
          email_sent_by: string | null
          email_status: string
          email_thread_id: string | null
          ghi_chu: string | null
          id: number
          khach_san_id: number
          lock_phong_id: number
          mail_content_hash: string | null
          outcome_status: string | null
          so_phong: string | null
          tinh_trang_phong: string | null
        }
        Insert: {
          check_in: string
          check_out: string
          code_doan_thanh?: string | null
          code_ncc?: string | null
          created_at?: string | null
          email_confirm_at?: string | null
          email_sent_at?: string | null
          email_sent_by?: string | null
          email_status?: string
          email_thread_id?: string | null
          ghi_chu?: string | null
          id?: number
          khach_san_id: number
          lock_phong_id: number
          mail_content_hash?: string | null
          outcome_status?: string | null
          so_phong?: string | null
          tinh_trang_phong?: string | null
        }
        Update: {
          check_in?: string
          check_out?: string
          code_doan_thanh?: string | null
          code_ncc?: string | null
          created_at?: string | null
          email_confirm_at?: string | null
          email_sent_at?: string | null
          email_sent_by?: string | null
          email_status?: string
          email_thread_id?: string | null
          ghi_chu?: string | null
          id?: number
          khach_san_id?: number
          lock_phong_id?: number
          mail_content_hash?: string | null
          outcome_status?: string | null
          so_phong?: string | null
          tinh_trang_phong?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lock_phong_ks_khach_san_id_fkey"
            columns: ["khach_san_id"]
            isOneToOne: false
            referencedRelation: "khach_san"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lock_phong_ks_lock_phong_id_fkey"
            columns: ["lock_phong_id"]
            isOneToOne: false
            referencedRelation: "lock_phong"
            referencedColumns: ["id"]
          },
        ]
      }
      nha_cung_cap: {
        Row: {
          created_at: string | null
          dia_chi: string | null
          dia_diem: string | null
          email: string | null
          ghi_chu: string | null
          id: number
          ma_so_thue: string | null
          ngan_hang: string | null
          so_dien_thoai: string | null
          so_tai_khoan: string | null
          tai_khoan_thanh_toan: string | null
          ten: string
          tra_truoc: boolean
        }
        Insert: {
          created_at?: string | null
          dia_chi?: string | null
          dia_diem?: string | null
          email?: string | null
          ghi_chu?: string | null
          id?: never
          ma_so_thue?: string | null
          ngan_hang?: string | null
          so_dien_thoai?: string | null
          so_tai_khoan?: string | null
          tai_khoan_thanh_toan?: string | null
          ten: string
          tra_truoc?: boolean
        }
        Update: {
          created_at?: string | null
          dia_chi?: string | null
          dia_diem?: string | null
          email?: string | null
          ghi_chu?: string | null
          id?: never
          ma_so_thue?: string | null
          ngan_hang?: string | null
          so_dien_thoai?: string | null
          so_tai_khoan?: string | null
          tai_khoan_thanh_toan?: string | null
          ten?: string
          tra_truoc?: boolean
        }
        Relationships: []
      }
      nha_hang: {
        Row: {
          chiet_khau_phan_tram: number | null
          created_at: string | null
          dia_chi: string | null
          dia_diem: string | null
          dia_diem_zh: string | null
          email: string | null
          foc_khach: number | null
          foc_mien: number | null
          hinh_anh: string | null
          id: number
          loai: string
          nguoi_thanh_toan: string | null
          nha_cung_cap_id: number | null
          so_dien_thoai: string | null
          tai_khoan_thanh_toan: string | null
          ten: string | null
          ten_zh: string | null
          thong_tin_chung: string | null
          tinh_suat_tl: boolean | null
          website: string | null
        }
        Insert: {
          chiet_khau_phan_tram?: number | null
          created_at?: string | null
          dia_chi?: string | null
          dia_diem?: string | null
          dia_diem_zh?: string | null
          email?: string | null
          foc_khach?: number | null
          foc_mien?: number | null
          hinh_anh?: string | null
          id?: never
          loai?: string
          nguoi_thanh_toan?: string | null
          nha_cung_cap_id?: number | null
          so_dien_thoai?: string | null
          tai_khoan_thanh_toan?: string | null
          ten?: string | null
          ten_zh?: string | null
          thong_tin_chung?: string | null
          tinh_suat_tl?: boolean | null
          website?: string | null
        }
        Update: {
          chiet_khau_phan_tram?: number | null
          created_at?: string | null
          dia_chi?: string | null
          dia_diem?: string | null
          dia_diem_zh?: string | null
          email?: string | null
          foc_khach?: number | null
          foc_mien?: number | null
          hinh_anh?: string | null
          id?: never
          loai?: string
          nguoi_thanh_toan?: string | null
          nha_cung_cap_id?: number | null
          so_dien_thoai?: string | null
          tai_khoan_thanh_toan?: string | null
          ten?: string | null
          ten_zh?: string | null
          thong_tin_chung?: string | null
          tinh_suat_tl?: boolean | null
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "nha_hang_nha_cung_cap_id_fkey"
            columns: ["nha_cung_cap_id"]
            isOneToOne: false
            referencedRelation: "nha_cung_cap"
            referencedColumns: ["id"]
          },
        ]
      }
      nha_hang_set_menu: {
        Row: {
          created_at: string | null
          don_vi: string | null
          ghi_chu: string | null
          gia: number | null
          gia_thue_tau: number
          id: number
          loai_gia: string
          nha_hang_id: number
          ten_set: string
        }
        Insert: {
          created_at?: string | null
          don_vi?: string | null
          ghi_chu?: string | null
          gia?: number | null
          gia_thue_tau?: number
          id?: never
          loai_gia?: string
          nha_hang_id: number
          ten_set: string
        }
        Update: {
          created_at?: string | null
          don_vi?: string | null
          ghi_chu?: string | null
          gia?: number | null
          gia_thue_tau?: number
          id?: never
          loai_gia?: string
          nha_hang_id?: number
          ten_set?: string
        }
        Relationships: [
          {
            foreignKeyName: "nha_hang_set_menu_nha_hang_id_fkey"
            columns: ["nha_hang_id"]
            isOneToOne: false
            referencedRelation: "nha_hang"
            referencedColumns: ["id"]
          },
        ]
      }
      nha_hang_set_menu_mon: {
        Row: {
          created_at: string | null
          id: number
          set_menu_id: number
          ten_mon: string
          ten_mon_trung: string | null
          thu_tu: number | null
        }
        Insert: {
          created_at?: string | null
          id?: never
          set_menu_id: number
          ten_mon: string
          ten_mon_trung?: string | null
          thu_tu?: number | null
        }
        Update: {
          created_at?: string | null
          id?: never
          set_menu_id?: number
          ten_mon?: string
          ten_mon_trung?: string | null
          thu_tu?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "nha_hang_set_menu_mon_set_menu_id_fkey"
            columns: ["set_menu_id"]
            isOneToOne: false
            referencedRelation: "nha_hang_set_menu"
            referencedColumns: ["id"]
          },
        ]
      }
      nha_xe: {
        Row: {
          created_at: string
          dia_diem: string | null
          email: string | null
          ghi_chu: string | null
          id: number
          nguoi_thanh_toan: string | null
          nha_cung_cap_id: number | null
          so_dien_thoai: string | null
          tai_khoan_thanh_toan: string | null
          ten: string
        }
        Insert: {
          created_at?: string
          dia_diem?: string | null
          email?: string | null
          ghi_chu?: string | null
          id?: number
          nguoi_thanh_toan?: string | null
          nha_cung_cap_id?: number | null
          so_dien_thoai?: string | null
          tai_khoan_thanh_toan?: string | null
          ten: string
        }
        Update: {
          created_at?: string
          dia_diem?: string | null
          email?: string | null
          ghi_chu?: string | null
          id?: number
          nguoi_thanh_toan?: string | null
          nha_cung_cap_id?: number | null
          so_dien_thoai?: string | null
          tai_khoan_thanh_toan?: string | null
          ten?: string
        }
        Relationships: [
          {
            foreignKeyName: "nha_xe_nha_cung_cap_id_fkey"
            columns: ["nha_cung_cap_id"]
            isOneToOne: false
            referencedRelation: "nha_cung_cap"
            referencedColumns: ["id"]
          },
        ]
      }
      nha_xe_loai_xe: {
        Row: {
          created_at: string
          don_vi: string | null
          ghi_chu: string | null
          gia: number | null
          id: number
          nha_xe_id: number
          so_cho: number | null
          ten_xe: string
        }
        Insert: {
          created_at?: string
          don_vi?: string | null
          ghi_chu?: string | null
          gia?: number | null
          id?: number
          nha_xe_id: number
          so_cho?: number | null
          ten_xe: string
        }
        Update: {
          created_at?: string
          don_vi?: string | null
          ghi_chu?: string | null
          gia?: number | null
          id?: number
          nha_xe_id?: number
          so_cho?: number | null
          ten_xe?: string
        }
        Relationships: [
          {
            foreignKeyName: "nha_xe_loai_xe_nha_xe_id_fkey"
            columns: ["nha_xe_id"]
            isOneToOne: false
            referencedRelation: "nha_xe"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          cong_no_id: number | null
          created_at: string | null
          dntt_id: number
          ghi_chu: string | null
          id: number
          method: string
          ngay_thanh_toan: string
          nguon: string | null
          so_tien: number
          tao_boi: string | null
          tao_luc: string | null
        }
        Insert: {
          cong_no_id?: number | null
          created_at?: string | null
          dntt_id: number
          ghi_chu?: string | null
          id?: number
          method: string
          ngay_thanh_toan?: string
          nguon?: string | null
          so_tien: number
          tao_boi?: string | null
          tao_luc?: string | null
        }
        Update: {
          cong_no_id?: number | null
          created_at?: string | null
          dntt_id?: number
          ghi_chu?: string | null
          id?: number
          method?: string
          ngay_thanh_toan?: string
          nguon?: string | null
          so_tien?: number
          tao_boi?: string | null
          tao_luc?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_cong_no_id_fkey"
            columns: ["cong_no_id"]
            isOneToOne: false
            referencedRelation: "cong_no"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_cong_no_id_fkey"
            columns: ["cong_no_id"]
            isOneToOne: false
            referencedRelation: "cong_no_with_status"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_dntt_id_fkey"
            columns: ["dntt_id"]
            isOneToOne: false
            referencedRelation: "de_nghi_thanh_toan"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_dntt_id_fkey"
            columns: ["dntt_id"]
            isOneToOne: false
            referencedRelation: "dntt_with_payment_status"
            referencedColumns: ["id"]
          },
        ]
      }
      role_permissions: {
        Row: {
          can_create: boolean
          can_delete: boolean
          can_edit: boolean
          can_view: boolean
          id: number
          resource: string
          role: string
          updated_at: string | null
        }
        Insert: {
          can_create?: boolean
          can_delete?: boolean
          can_edit?: boolean
          can_view?: boolean
          id?: never
          resource: string
          role: string
          updated_at?: string | null
        }
        Update: {
          can_create?: boolean
          can_delete?: boolean
          can_edit?: boolean
          can_view?: boolean
          id?: never
          resource?: string
          role?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      seri_tour: {
        Row: {
          created_at: string | null
          id: number
          mo_ta: string | null
          shopping: boolean | null
          tang_pham: string[] | null
          ten_seri: string
        }
        Insert: {
          created_at?: string | null
          id?: never
          mo_ta?: string | null
          shopping?: boolean | null
          tang_pham?: string[] | null
          ten_seri: string
        }
        Update: {
          created_at?: string | null
          id?: never
          mo_ta?: string | null
          shopping?: boolean | null
          tang_pham?: string[] | null
          ten_seri?: string
        }
        Relationships: []
      }
      seri_tour_ngay: {
        Row: {
          an_toi_ghi_chu: string | null
          an_toi_nha_hang_id: number | null
          an_toi_set_menu_id: number | null
          an_trua_ghi_chu: string | null
          an_trua_nha_hang_id: number | null
          an_trua_set_menu_id: number | null
          created_at: string | null
          id: number
          khach_san_id: number | null
          ks_loai_phong: string | null
          ks_ma_code: string | null
          ngay_so: number
          seri_id: number
          thanh_pho: string | null
        }
        Insert: {
          an_toi_ghi_chu?: string | null
          an_toi_nha_hang_id?: number | null
          an_toi_set_menu_id?: number | null
          an_trua_ghi_chu?: string | null
          an_trua_nha_hang_id?: number | null
          an_trua_set_menu_id?: number | null
          created_at?: string | null
          id?: never
          khach_san_id?: number | null
          ks_loai_phong?: string | null
          ks_ma_code?: string | null
          ngay_so?: number
          seri_id: number
          thanh_pho?: string | null
        }
        Update: {
          an_toi_ghi_chu?: string | null
          an_toi_nha_hang_id?: number | null
          an_toi_set_menu_id?: number | null
          an_trua_ghi_chu?: string | null
          an_trua_nha_hang_id?: number | null
          an_trua_set_menu_id?: number | null
          created_at?: string | null
          id?: never
          khach_san_id?: number | null
          ks_loai_phong?: string | null
          ks_ma_code?: string | null
          ngay_so?: number
          seri_id?: number
          thanh_pho?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "seri_tour_ngay_an_toi_nha_hang_id_fkey"
            columns: ["an_toi_nha_hang_id"]
            isOneToOne: false
            referencedRelation: "nha_hang"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seri_tour_ngay_an_toi_set_menu_id_fkey"
            columns: ["an_toi_set_menu_id"]
            isOneToOne: false
            referencedRelation: "nha_hang_set_menu"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seri_tour_ngay_an_trua_nha_hang_id_fkey"
            columns: ["an_trua_nha_hang_id"]
            isOneToOne: false
            referencedRelation: "nha_hang"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seri_tour_ngay_an_trua_set_menu_id_fkey"
            columns: ["an_trua_set_menu_id"]
            isOneToOne: false
            referencedRelation: "nha_hang_set_menu"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seri_tour_ngay_khach_san_id_fkey"
            columns: ["khach_san_id"]
            isOneToOne: false
            referencedRelation: "khach_san"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seri_tour_ngay_seri_id_fkey"
            columns: ["seri_id"]
            isOneToOne: false
            referencedRelation: "seri_tour"
            referencedColumns: ["id"]
          },
        ]
      }
      seri_tour_ngay_item: {
        Row: {
          canh_diem_id: number
          co_phi: boolean | null
          created_at: string | null
          don_gia: number | null
          ghi_chu: string | null
          id: number
          nguoi_thanh_toan: string | null
          seri_ngay_id: number
          thu_tu: number | null
        }
        Insert: {
          canh_diem_id: number
          co_phi?: boolean | null
          created_at?: string | null
          don_gia?: number | null
          ghi_chu?: string | null
          id?: never
          nguoi_thanh_toan?: string | null
          seri_ngay_id: number
          thu_tu?: number | null
        }
        Update: {
          canh_diem_id?: number
          co_phi?: boolean | null
          created_at?: string | null
          don_gia?: number | null
          ghi_chu?: string | null
          id?: never
          nguoi_thanh_toan?: string | null
          seri_ngay_id?: number
          thu_tu?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "seri_tour_ngay_item_canh_diem_id_fkey"
            columns: ["canh_diem_id"]
            isOneToOne: false
            referencedRelation: "canh_diem"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seri_tour_ngay_item_seri_ngay_id_fkey"
            columns: ["seri_ngay_id"]
            isOneToOne: false
            referencedRelation: "seri_tour_ngay"
            referencedColumns: ["id"]
          },
        ]
      }
      site_menus: {
        Row: {
          badge: string | null
          href: string
          icon: string | null
          id: string
          label: string
          menu_key: string
          position: number
          updated_at: string
          visible: boolean
        }
        Insert: {
          badge?: string | null
          href?: string
          icon?: string | null
          id?: string
          label: string
          menu_key: string
          position?: number
          updated_at?: string
          visible?: boolean
        }
        Update: {
          badge?: string | null
          href?: string
          icon?: string | null
          id?: string
          label?: string
          menu_key?: string
          position?: number
          updated_at?: string
          visible?: boolean
        }
        Relationships: []
      }
      site_sections: {
        Row: {
          id: string
          label: string
          page: string
          position: number
          updated_at: string
          visible: boolean
        }
        Insert: {
          id: string
          label: string
          page?: string
          position?: number
          updated_at?: string
          visible?: boolean
        }
        Update: {
          id?: string
          label?: string
          page?: string
          position?: number
          updated_at?: string
          visible?: boolean
        }
        Relationships: []
      }
      site_text: {
        Row: {
          key: string
          updated_at: string
          value: string
        }
        Insert: {
          key: string
          updated_at?: string
          value: string
        }
        Update: {
          key?: string
          updated_at?: string
          value?: string
        }
        Relationships: []
      }
      team_agents: {
        Row: {
          agent_id: number
          id: number
          team_id: number
        }
        Insert: {
          agent_id: number
          id?: never
          team_id: number
        }
        Update: {
          agent_id?: number
          id?: never
          team_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "team_agents_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_agents_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      team_task_assignments: {
        Row: {
          created_at: string | null
          id: number
          task_type: string
          team_id: number
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: never
          task_type: string
          team_id: number
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: never
          task_type?: string
          team_id?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_task_assignments_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      teams: {
        Row: {
          created_at: string | null
          id: number
          ten_team: string
        }
        Insert: {
          created_at?: string | null
          id?: never
          ten_team: string
        }
        Update: {
          created_at?: string | null
          id?: never
          ten_team?: string
        }
        Relationships: []
      }
      thong_bao: {
        Row: {
          cong_viec_id: number | null
          created_at: string | null
          dntt_id: number | null
          doan_id: number | null
          doan_ten: string | null
          id: number
          is_read: boolean | null
          loai: string
          log_id: number | null
          noi_dung: string | null
          tieu_de: string
          user_id: string
        }
        Insert: {
          cong_viec_id?: number | null
          created_at?: string | null
          dntt_id?: number | null
          doan_id?: number | null
          doan_ten?: string | null
          id?: never
          is_read?: boolean | null
          loai: string
          log_id?: number | null
          noi_dung?: string | null
          tieu_de: string
          user_id: string
        }
        Update: {
          cong_viec_id?: number | null
          created_at?: string | null
          dntt_id?: number | null
          doan_id?: number | null
          doan_ten?: string | null
          id?: never
          is_read?: boolean | null
          loai?: string
          log_id?: number | null
          noi_dung?: string | null
          tieu_de?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "thong_bao_cong_viec_id_fkey"
            columns: ["cong_viec_id"]
            isOneToOne: false
            referencedRelation: "cong_viec"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "thong_bao_dntt_id_fkey"
            columns: ["dntt_id"]
            isOneToOne: false
            referencedRelation: "de_nghi_thanh_toan"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "thong_bao_dntt_id_fkey"
            columns: ["dntt_id"]
            isOneToOne: false
            referencedRelation: "dntt_with_payment_status"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "thong_bao_log_id_fkey"
            columns: ["log_id"]
            isOneToOne: false
            referencedRelation: "doan_log"
            referencedColumns: ["id"]
          },
        ]
      }
      trang_thai: {
        Row: {
          id: number
          ten: string | null
        }
        Insert: {
          id?: never
          ten?: string | null
        }
        Update: {
          id?: never
          ten?: string | null
        }
        Relationships: []
      }
      user_permissions: {
        Row: {
          can_create: boolean
          can_delete: boolean
          can_edit: boolean
          can_view: boolean
          created_at: string
          id: string
          resource: string
          user_id: string
        }
        Insert: {
          can_create?: boolean
          can_delete?: boolean
          can_edit?: boolean
          can_view?: boolean
          created_at?: string
          id?: string
          resource: string
          user_id: string
        }
        Update: {
          can_create?: boolean
          can_delete?: boolean
          can_edit?: boolean
          can_view?: boolean
          created_at?: string
          id?: string
          resource?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          active: boolean
          bo_phan: string | null
          created_at: string | null
          email: string | null
          ghi_chu: string | null
          ho_ten: string | null
          id: string
          la_dieu_phoi: boolean | null
          password_hash: string | null
          phan_loai_tour: string[] | null
          pv_default_for: string | null
          role: string
          so_dien_thoai: string | null
          user_id: string
          van_phong_id: number | null
        }
        Insert: {
          active?: boolean
          bo_phan?: string | null
          created_at?: string | null
          email?: string | null
          ghi_chu?: string | null
          ho_ten?: string | null
          id?: string
          la_dieu_phoi?: boolean | null
          password_hash?: string | null
          phan_loai_tour?: string[] | null
          pv_default_for?: string | null
          role: string
          so_dien_thoai?: string | null
          user_id: string
          van_phong_id?: number | null
        }
        Update: {
          active?: boolean
          bo_phan?: string | null
          created_at?: string | null
          email?: string | null
          ghi_chu?: string | null
          ho_ten?: string | null
          id?: string
          la_dieu_phoi?: boolean | null
          password_hash?: string | null
          phan_loai_tour?: string[] | null
          pv_default_for?: string | null
          role?: string
          so_dien_thoai?: string | null
          user_id?: string
          van_phong_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_van_phong_id_fkey"
            columns: ["van_phong_id"]
            isOneToOne: false
            referencedRelation: "van_phong"
            referencedColumns: ["id"]
          },
        ]
      }
      van_phong: {
        Row: {
          active: boolean
          dia_chi: string | null
          ghi_chu: string | null
          id: number
          ten: string
        }
        Insert: {
          active?: boolean
          dia_chi?: string | null
          ghi_chu?: string | null
          id?: number
          ten: string
        }
        Update: {
          active?: boolean
          dia_chi?: string | null
          ghi_chu?: string | null
          id?: number
          ten?: string
        }
        Relationships: []
      }
      web_admin_users: {
        Row: {
          created_at: string
          email: string
          full_name: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          email: string
          full_name?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string
          full_name?: string | null
          user_id?: string
        }
        Relationships: []
      }
      web_bookings: {
        Row: {
          created_at: string
          customer_email: string
          customer_name: string
          customer_phone: string | null
          guests: number
          id: string
          note: string | null
          status: string
          tour_id: string | null
          tour_slug: string
          tour_title: string
          travel_date: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          customer_email: string
          customer_name: string
          customer_phone?: string | null
          guests: number
          id?: string
          note?: string | null
          status?: string
          tour_id?: string | null
          tour_slug: string
          tour_title: string
          travel_date: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          customer_email?: string
          customer_name?: string
          customer_phone?: string | null
          guests?: number
          id?: string
          note?: string | null
          status?: string
          tour_id?: string | null
          tour_slug?: string
          tour_title?: string
          travel_date?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "web_bookings_tour_id_fkey"
            columns: ["tour_id"]
            isOneToOne: false
            referencedRelation: "web_tours"
            referencedColumns: ["id"]
          },
        ]
      }
      web_destinations: {
        Row: {
          continent: string
          country: string
          created_at: string
          id: string
          image_url: string
          is_published: boolean
          name: string
          region: string | null
          slug: string
          sort_order: number
          tours_count: number
          updated_at: string
        }
        Insert: {
          continent: string
          country: string
          created_at?: string
          id?: string
          image_url: string
          is_published?: boolean
          name: string
          region?: string | null
          slug: string
          sort_order?: number
          tours_count?: number
          updated_at?: string
        }
        Update: {
          continent?: string
          country?: string
          created_at?: string
          id?: string
          image_url?: string
          is_published?: boolean
          name?: string
          region?: string | null
          slug?: string
          sort_order?: number
          tours_count?: number
          updated_at?: string
        }
        Relationships: []
      }
      web_tours: {
        Row: {
          badge: string | null
          created_at: string
          days: number
          description: string
          duration: string
          excluded: string[]
          highlights: string[]
          id: string
          image_url: string
          included: string[]
          is_published: boolean
          itinerary: Json
          location: string
          price: number
          rating: number
          reviews: number
          slug: string
          sort_order: number
          title: string
          updated_at: string
        }
        Insert: {
          badge?: string | null
          created_at?: string
          days: number
          description: string
          duration: string
          excluded?: string[]
          highlights?: string[]
          id?: string
          image_url: string
          included?: string[]
          is_published?: boolean
          itinerary?: Json
          location: string
          price: number
          rating?: number
          reviews?: number
          slug: string
          sort_order?: number
          title: string
          updated_at?: string
        }
        Update: {
          badge?: string | null
          created_at?: string
          days?: number
          description?: string
          duration?: string
          excluded?: string[]
          highlights?: string[]
          id?: string
          image_url?: string
          included?: string[]
          is_published?: boolean
          itinerary?: Json
          location?: string
          price?: number
          rating?: number
          reviews?: number
          slug?: string
          sort_order?: number
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      voucher: {
        Row: {
          active: boolean
          created_at: string | null
          ghi_chu: string | null
          id: number
          loai: string
          nha_cung_cap_id: number | null
          ngay_tao: string | null
          so_luong: number
          ten: string
        }
        Insert: {
          active?: boolean
          created_at?: string | null
          ghi_chu?: string | null
          id?: number
          loai?: string
          nha_cung_cap_id?: number | null
          ngay_tao?: string | null
          so_luong?: number
          ten: string
        }
        Update: {
          active?: boolean
          created_at?: string | null
          ghi_chu?: string | null
          id?: number
          loai?: string
          nha_cung_cap_id?: number | null
          ngay_tao?: string | null
          so_luong?: number
          ten?: string
        }
        Relationships: [
          {
            foreignKeyName: "voucher_nha_cung_cap_id_fkey"
            columns: ["nha_cung_cap_id"]
            isOneToOne: false
            referencedRelation: "nha_cung_cap"
            referencedColumns: ["id"]
          },
        ]
      }
      voucher_su_dung: {
        Row: {
          chi_phi_id: number | null
          created_at: string | null
          dntt_id: number | null
          doan_id: number | null
          gia_tri: number
          ghi_chu: string | null
          id: number
          ngay_dung: string | null
          so_luong: number
          tao_boi: string | null
          voucher_id: number
        }
        Insert: {
          chi_phi_id?: number | null
          created_at?: string | null
          dntt_id?: number | null
          doan_id?: number | null
          gia_tri?: number
          ghi_chu?: string | null
          id?: number
          ngay_dung?: string | null
          so_luong?: number
          tao_boi?: string | null
          voucher_id: number
        }
        Update: {
          chi_phi_id?: number | null
          created_at?: string | null
          dntt_id?: number | null
          doan_id?: number | null
          gia_tri?: number
          ghi_chu?: string | null
          id?: number
          ngay_dung?: string | null
          so_luong?: number
          tao_boi?: string | null
          voucher_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "voucher_su_dung_voucher_id_fkey"
            columns: ["voucher_id"]
            isOneToOne: false
            referencedRelation: "voucher"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voucher_su_dung_voucher_id_fkey"
            columns: ["voucher_id"]
            isOneToOne: false
            referencedRelation: "voucher_with_status"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voucher_su_dung_doan_id_fkey"
            columns: ["doan_id"]
            isOneToOne: false
            referencedRelation: "doan"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voucher_su_dung_chi_phi_id_fkey"
            columns: ["chi_phi_id"]
            isOneToOne: false
            referencedRelation: "doan_chi_phi"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voucher_su_dung_dntt_id_fkey"
            columns: ["dntt_id"]
            isOneToOne: false
            referencedRelation: "de_nghi_thanh_toan"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      voucher_with_status: {
        Row: {
          active: boolean | null
          created_at: string | null
          ghi_chu: string | null
          id: number | null
          loai: string | null
          nha_cung_cap_id: number | null
          ngay_tao: string | null
          so_luong: number | null
          so_luong_con_lai: number | null
          so_luong_da_dung: number | null
          ten: string | null
          tong_gia_tri_da_dung: number | null
        }
        Relationships: [
          {
            foreignKeyName: "voucher_nha_cung_cap_id_fkey"
            columns: ["nha_cung_cap_id"]
            isOneToOne: false
            referencedRelation: "nha_cung_cap"
            referencedColumns: ["id"]
          },
        ]
      }
      cong_no_with_status: {
        Row: {
          created_at: string | null
          dntt_goc_id: number | null
          doan_id: number | null
          ghi_chu: string | null
          id: number | null
          loai: string | null
          ly_do: string | null
          ngay_tao: string | null
          nha_cung_cap_id: number | null
          so_tien_con_lai: number | null
          so_tien_da_dung: number | null
          so_tien_goc: number | null
          ten_nha_cung_cap: string | null
          trang_thai: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cong_no_dntt_goc_id_fkey"
            columns: ["dntt_goc_id"]
            isOneToOne: false
            referencedRelation: "de_nghi_thanh_toan"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cong_no_dntt_goc_id_fkey"
            columns: ["dntt_goc_id"]
            isOneToOne: false
            referencedRelation: "dntt_with_payment_status"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cong_no_doan_id_fkey"
            columns: ["doan_id"]
            isOneToOne: false
            referencedRelation: "doan"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cong_no_nha_cung_cap_id_fkey"
            columns: ["nha_cung_cap_id"]
            isOneToOne: false
            referencedRelation: "nha_cung_cap"
            referencedColumns: ["id"]
          },
        ]
      }
      dntt_with_payment_status: {
        Row: {
          created_at: string | null
          doan_id: number | null
          duyet_boi: string | null
          duyet_luc: string | null
          ghi_chu: string | null
          hoa_don_so_tien: number | null
          hoa_don_url: string | null
          hoan_ung_items: Json | null
          huy_boi: string | null
          huy_luc: string | null
          id: number | null
          ktt_duyet_boi: string | null
          ktt_duyet_luc: string | null
          kttt_duyet_boi: string | null
          kttt_duyet_luc: string | null
          la_coc: boolean | null
          loai: string | null
          loai_chi_hoan_ung: string | null
          mo_ta: string | null
          ngan_hang: string | null
          ngay_can_thanh_toan: string | null
          nguoi_ung_id: string | null
          nha_cung_cap_id: number | null
          paid_amount: number | null
          payment_status: string | null
          quyet_toan_data: Json | null
          ref_id: number | null
          ref_loai: string | null
          so_tai_khoan: string | null
          so_tien: number | null
          tao_boi: string | null
          tao_luc: string | null
          ten_nha_cung_cap: string | null
          thanh_toan_luc: string | null
          tp_dh_duyet_boi: string | null
          tp_dh_duyet_luc: string | null
          trang_thai_duyet: string | null
          trang_thai_hoa_don: string | null
          trang_thai_unc: string | null
          tu_choi_boi: string | null
          tu_choi_cap: number | null
          tu_choi_luc: string | null
          ty_le_coc: number | null
          unc_url: string | null
        }
        Relationships: [
          {
            foreignKeyName: "de_nghi_thanh_toan_doan_id_fkey"
            columns: ["doan_id"]
            isOneToOne: false
            referencedRelation: "doan"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "de_nghi_thanh_toan_nha_cung_cap_id_fkey"
            columns: ["nha_cung_cap_id"]
            isOneToOne: false
            referencedRelation: "nha_cung_cap"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      create_lead_from_form: {
        Args: {
          p_diem_den?: string
          p_email?: string
          p_ghi_chu?: string
          p_ho_ten: string
          p_loai_tour?: string
          p_ngan_sach_per_khach?: number
          p_ngay_di_du_kien?: string
          p_ngay_ve_du_kien?: string
          p_nguon?: string
          p_so_dien_thoai?: string
          p_so_nguoi_em?: number
          p_so_nguoi_lon?: number
          p_yeu_cau_dac_biet?: string
        }
        Returns: number
      }
      fn_doan_booking_escalation: { Args: never; Returns: undefined }
      fn_get_least_loaded_sales: {
        Args: { p_loai_tour: string }
        Returns: string
      }
      fn_lead_followup_check: { Args: never; Returns: undefined }
      fn_remind_pv_phancong: { Args: never; Returns: undefined }
      get_dntt_pending_export: {
        Args: never
        Returns: {
          doan_id: number
          hoa_don_url: string
          id: number
          loai: string
          mo_ta: string
          ngay_can_thanh_toan: string
          nguon: string
          payment_status: string
          so_tien: number
          ten_doan: string
          ten_nha_cung_cap: string
          thanh_toan_luc: string
          unc_url: string
        }[]
      }
      get_lead_by_nguon: {
        Args: {
          p_from: string
          p_loai_tour?: string
          p_to: string
          p_van_phong_id?: number
        }
        Returns: {
          chot_deal: number
          nguon: string
          total_lead: number
        }[]
      }
      get_lead_by_sales: {
        Args: {
          p_from: string
          p_loai_tour?: string
          p_to: string
          p_van_phong_id?: number
        }
        Returns: {
          chot_deal: number
          dang_xu_ly: number
          ho_ten: string
          mat_khach: number
          total_lead: number
          user_id: string
        }[]
      }
      get_lead_funnel: {
        Args: {
          p_from: string
          p_loai_tour?: string
          p_to: string
          p_van_phong_id?: number
        }
        Returns: {
          cnt: number
          trang_thai: string
        }[]
      }
      get_lead_ly_do_mat: {
        Args: {
          p_from: string
          p_loai_tour?: string
          p_to: string
          p_van_phong_id?: number
        }
        Returns: {
          cnt: number
          ly_do: string
        }[]
      }
      get_lead_stats: {
        Args: { p_user_id: string }
        Returns: {
          follow_up_overdue: number
          follow_up_today: number
          lead_moi_today: number
        }[]
      }
      get_user_role: { Args: never; Returns: string }
      is_admin:
        | { Args: never; Returns: boolean }
        | { Args: { user_id: string }; Returns: boolean }
      is_web_admin: { Args: never; Returns: boolean }
      mark_deadline_done: {
        Args: { p_booking_id: number; p_type: string }
        Returns: number
      }
      recalc_chi_phi_payment_status: {
        Args: { p_chi_phi_ids: number[] }
        Returns: undefined
      }
      update_lead_status: {
        Args: {
          p_created_by?: string
          p_lead_id: number
          p_ly_do_mat?: string
          p_trang_thai_moi: string
        }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
