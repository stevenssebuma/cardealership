export type AdminCustomer = {
  id: number;
  name: string;
  email: string;
  role: string;
  phone: string | null;
  joinedAt: string | null;
  bookingCount: number;
};

export type CustomerBookingStatus = "upcoming" | "completed" | "cancelled";

export type AdminCustomerBooking = {
  id: string;
  vehicleName: string;
  date: string;
  time: string;
  status: CustomerBookingStatus;
  notes: string;
};

export type CustomerBookingCounts = {
  upcoming: number;
  completed: number;
  cancelled: number;
};

export type AdminCustomersErrorCode =
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "LOAD_FAILED";

export type AdminCustomersResult =
  | { success: true; customers: AdminCustomer[] }
  | { success: false; code: AdminCustomersErrorCode; message: string };

export type CustomerBookingsResult =
  | {
      success: true;
      customer: AdminCustomer;
      bookings: AdminCustomerBooking[];
      counts: CustomerBookingCounts;
    }
  | { success: false; code: AdminCustomersErrorCode; message: string };
