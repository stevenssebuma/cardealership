import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { useAuth } from "@/features/auth/hooks";
import { TestDriveBookingError, submitTestDriveBooking } from "../services";
import type { TestDriveBookingPayload, TestDriveVehicleOption } from "../types";
import { useBookingAvailability } from "./useBookingAvailability";
import { canSubmitWithAvailability, shouldClearSelectedTime } from "../utils/availabilitySelection";
import { getTodayDateInputValue } from "../utils/bookingDate";
import { resolveSelectedVehicleId } from "../utils/vehicleSelection";

const LOGIN_REDIRECT = `/login?redirect=${encodeURIComponent("/#test-drive")}`;

export function useTestDrive(vehicles: TestDriveVehicleOption[]) {
  const navigate = useNavigate();
  const { isAuthenticated, user } = useAuth();
  const today = useMemo(() => getTodayDateInputValue(), []);
  const [selectedVehicleId, setSelectedVehicleId] = useState(vehicles[0]?.id?.toString() ?? "");
  const [date, setDate] = useState(today);
  const [time, setTime] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [authMessage, setAuthMessage] = useState("");
  const [success, setSuccess] = useState(false);
  const [confirmation, setConfirmation] = useState<{ message: string; reference: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const availability = useBookingAvailability(selectedVehicleId, date);
  const selectedVehicle = vehicles.find((vehicle) => vehicle.id.toString() === selectedVehicleId);

  useEffect(() => {
    // The inventory loads asynchronously, so the first render has no vehicles to
    // seed the selection with. Once the list arrives (or changes) make sure a
    // real vehicle stays selected, otherwise the dropdown renders blank and the
    // customer can never load availability or submit a request.
    setSelectedVehicleId((current) => resolveSelectedVehicleId(vehicles, current));
  }, [vehicles]);

  useEffect(() => {
    // Only drop a chosen slot once the server has settled on an answer. While a
    // request is in flight the result is null, and clearing then would erase the
    // time from the confirmation receipt shown immediately after a booking.
    if (success || availability.status !== "ready") return;

    if (shouldClearSelectedTime(time, availability.result)) {
      setTime("");
    }
  }, [availability.result, availability.status, success, time]);

  function handleVehicleChange(vehicleId: string) {
    setSelectedVehicleId(vehicleId);
    setTime("");
    setError("");
  }

  function handleDateChange(nextDate: string) {
    setDate(nextDate);
    setTime("");
    setError("");
  }

  const resetSuccess = () => {
    setSuccess(false);
    setConfirmation(null);
    setError("");
    setTime("");
    // The slot that was just booked has to show up as reserved for the next
    // request, so refresh availability when the customer starts again.
    availability.retry();
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setAuthMessage("");
    setSuccess(false);
    setConfirmation(null);

    if (submitting || availability.status === "loading") return;

    if (!isAuthenticated) {
      setAuthMessage("Please sign in first so we can reserve your test drive securely.");
      setTimeout(() => navigate(LOGIN_REDIRECT), 1200);
      return;
    }

    if (!selectedVehicleId) {
      setError("Please choose a vehicle.");
      return;
    }

    if (!date || date < today) {
      setError("Please choose today or a future date.");
      return;
    }

    if (!canSubmitWithAvailability(availability.status, time, availability.result)) {
      // The "loading" case is already handled by the guard above, so this branch
      // only covers a settled availability result that does not offer the slot.
      setError("Please choose an available test drive time.");
      return;
    }

    if (!phone.trim()) {
      setError("Please enter your phone number.");
      return;
    }

    const bookingPayload: TestDriveBookingPayload = {
      vehicleId: selectedVehicleId,
      vehicleName: selectedVehicle?.name,
      date,
      time,
      phone,
      notes,
      // The booking endpoint stores the booking against the signed-in account
      // and emails the confirmation, so the customer details travel with it.
      customerId: user?.id,
      customerName: user?.name,
      customerEmail: user?.email,
    };

    try {
      setSubmitting(true);
      const result = await submitTestDriveBooking(bookingPayload);
      setConfirmation({ message: result.message, reference: result.reference ?? "" });
      setSuccess(true);
      setNotes("");
      // Refreshing availability here would flip the picker to "loading" and blank
      // out the confirmed time on the receipt below, so the remaining slots are
      // refreshed from resetSuccess when the customer books another test drive.
    } catch (submitError) {
      if (submitError instanceof TestDriveBookingError) {
        setError(submitError.message);

        if (submitError.code === "UNAUTHORIZED") {
          setTimeout(() => navigate(LOGIN_REDIRECT), 1500);
        }

        if (submitError.code === "SLOT_CONFLICT") {
          // Someone else took the slot between loading and submitting.
          setTime("");
          availability.retry();
        }
      } else {
        setError("Unable to submit your test drive request. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return {
    today, isAuthenticated, selectedVehicleId, setSelectedVehicleId: handleVehicleChange, date, setDate: handleDateChange, time, setTime, phone, setPhone, notes, setNotes, error, authMessage, success, confirmation, submitting, selectedVehicle, availability, resetSuccess, handleSubmit,
  };
}

