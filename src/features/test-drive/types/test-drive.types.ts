export type TestDriveBookingPayload = {
  vehicleId: string;
  vehicleName?: string;
  date: string;
  time: string;
  phone: string;
  notes?: string;
  /**
   * Details of the signed-in customer. The backend booking endpoint needs the
   * account id to attach the booking to a profile and an email address to send
   * the confirmation and reminder emails.
   */
  customerId?: string;
  customerName?: string;
  customerEmail?: string;
};

export type TestDriveBookingNotification = {
  attempted?: boolean;
  sent?: boolean;
  skipped?: boolean;
  provider?: string;
  reason?: string;
};

export type TestDriveBookingResult = {
  success: boolean;
  message: string;
  /** Human readable reference shown on the confirmation panel. */
  reference?: string;
  notification?: TestDriveBookingNotification;
};

export type TestDriveVehicleOption = {
  id: number;
  name: string;
  brand: string;
  year: number;
};
