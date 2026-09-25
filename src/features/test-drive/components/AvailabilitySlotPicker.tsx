import { Clock, LoaderCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type {
  AvailabilityResult,
  AvailabilityState,
} from "../types";
import "./AvailabilitySlotPicker.css";

type AvailabilitySlotPickerProps = {
  value: string;
  onChange: (time: string) => void;
  state: AvailabilityState;
  vehicleSelected: boolean;
  dateSelected: boolean;
  /** Re-runs the availability request after a failed load. */
  onRetry?: () => void;
};

function getSuccessfulResult(
  result: AvailabilityResult | null,
) {
  return result?.success ? result : null;
}

export function AvailabilitySlotPicker({
  value,
  onChange,
  state,
  vehicleSelected,
  dateSelected,
  onRetry,
}: AvailabilitySlotPickerProps) {
  const successfulResult = getSuccessfulResult(state.result);
  const retryButton = onRetry ? (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="availability-retry"
      onClick={onRetry}
    >
      <RefreshCw size={14} className="mr-1" />
      Try again
    </Button>
  ) : null;

  return (
    <fieldset className="availability-picker">
      <Label className="flex items-center gap-2">
        <Clock size={16} />
        Time
      </Label>

      {!vehicleSelected || !dateSelected ? (
        <p className="availability-message">
          Select a vehicle and date to view available times.
        </p>
      ) : state.status === "loading" ? (
        <p className="availability-message availability-loading">
          <LoaderCircle size={16} className="animate-spin" />
          Checking availability...
        </p>
      ) : state.status === "error" ? (
        <p role="alert" className="availability-message availability-error">
          <span>
            {state.result && !state.result.success
              ? state.result.message
              : "Availability could not be loaded. Please try again."}
          </span>
          {retryButton}
        </p>
      ) : successfulResult ? (
        <>
          {successfulResult.slots.length === 0 ? (
            <p className="availability-message">
              No time slots were returned for this date.
            </p>
          ) : (
            <div className="availability-slot-grid">
              {successfulResult.slots.map((slot) => (
                <Button
                  key={slot.time}
                  type="button"
                  variant={value === slot.time ? "default" : "outline"}
                  disabled={!slot.available}
                  aria-pressed={value === slot.time}
                  onClick={() => onChange(slot.time)}
                  className="availability-slot"
                >
                  {slot.time}
                  {!slot.available && (
                    <span className="availability-reserved">Reserved</span>
                  )}
                </Button>
              ))}
            </div>
          )}

          {successfulResult.availableSlots.length === 0 && (
            <p className="availability-message availability-error">
              No test-drive times are available on this date.
            </p>
          )}

          {retryButton && (
            <p className="availability-message">
              <span>
                {successfulResult.availableSlots.length} of{" "}
                {successfulResult.slots.length} slots are still open.
              </span>
              {retryButton}
            </p>
          )}

          {successfulResult.mock && (
            <p className="availability-mock-note">
              Synthetic development availability is displayed.
            </p>
          )}
        </>
      ) : (
        <p className="availability-message">
          Choose a vehicle and date to check availability.
        </p>
      )}
    </fieldset>
  );
}
