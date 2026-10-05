import {
  AlertCircle,
  CalendarClock,
  RefreshCw,
} from "lucide-react";
import { useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../../../components/ui/card";
import { useBookingHistory } from "../hooks/useBookingHistory";
import { groupBookingHistory } from "../utils/bookingHistory";
import type { BookingHistoryItem } from "../types";
import "./BookingHistory.css";

function BookingGroup({ items }: { items: BookingHistoryItem[] }) {
  if (items.length === 0) {
    return <div className="booking-state">No bookings in this group.</div>;
  }

  return (
    <div className="booking-list">
      {items.map((booking) => (
        <Card key={booking.id}>
          <CardContent className="booking-item">
            <div>
              <strong>{booking.vehicleName}</strong>
              <p>{booking.date} at {booking.time}</p>
            </div>
            <span className={`booking-${booking.status}`}>
              {booking.status}
            </span>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function BookingHistory() {
  const { isLoading, result, refresh } = useBookingHistory();
  const [activeTab, setActiveTab] = useState<"upcoming" | "completed" | "cancelled">("upcoming");

  if (isLoading) {
    return (
      <Card className="profile-settings-wide">
        <CardContent className="booking-loading">
          <div className="h-8 w-64 animate-pulse rounded-md bg-muted" />
          <div className="h-28 w-full animate-pulse rounded-md bg-muted" />
        </CardContent>
      </Card>
    );
  }

  // `strict` is off in tsconfig.check.json, so a boolean discriminant only
  // narrows through an explicit equality check rather than a truthiness test.
  const failureMessage =
    result && result.success === false ? result.message : null;

  if (!result || result.success === false) {
    return (
      <Card className="profile-settings-wide">
        <CardContent className="booking-state booking-error">
          <AlertCircle size={22} />
          <p>{failureMessage ?? "Booking history is unavailable."}</p>
          <button
            type="button"
            className="inline-flex items-center justify-center gap-2 rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground"
            onClick={() => void refresh()}
          >
            <RefreshCw size={16} />
            Retry
          </button>
        </CardContent>
      </Card>
    );
  }

  const groups = groupBookingHistory(result.bookings);

  return (
    <Card className="profile-settings-wide">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarClock size={22} />
          Test-drive history
        </CardTitle>
        {result.mock && (
          <p className="booking-mock">
            Synthetic development booking data is displayed.
          </p>
        )}
      </CardHeader>
      <CardContent>
        <div role="tablist" aria-label="Booking history">
          {(["upcoming", "completed", "cancelled"] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={activeTab === tab}
              onClick={() => setActiveTab(tab)}
            >
              {tab[0].toUpperCase() + tab.slice(1)} ({groups[tab].length})
            </button>
          ))}
        </div>
        <div role="tabpanel">
          <BookingGroup items={groups[activeTab]} />
        </div>
      </CardContent>
    </Card>
  );
}
