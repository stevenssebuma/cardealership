// src/pages/Admin/AdminPage.tsx
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, LogOut, MessageSquare } from "lucide-react";

import { authenticatedApiRequest } from "@/api/client";
import { getStoredSession } from "@/features/auth/services";
import { useAuth } from "@/features/auth/hooks";
import { formatUGX } from "@/features/cars/utils/formatUGX";
import { AdminShell } from "@/app/components/admin/AdminShell";
import { UnreadChatBadge } from "@/features/admin-chat/components/UnreadChatBadge";
import { useAdminChat } from "@/features/admin-chat/hooks";
import { CustomersPanel } from "@/features/admin-customers/components/CustomersPanel";
import { CustomerBookingsDrawer } from "@/features/admin-customers/components/CustomerBookingsDrawer";
import { useAdminCustomers } from "@/features/admin-customers/hooks";

type AdminTab = "overview" | "pending" | "bookings" | "customers";

type BookingStatus = "pending" | "confirmed" | "completed" | "cancelled";

interface AdminStats {
  cars: { total: number; available: number };
  users: { total: number };
  bookings: {
    total: number;
    pending: number;
    confirmed: number;
    completed: number;
  };
  revenue?: { available: boolean; monthly: number };
  popularCars: {
    id: number;
    name: string;
    make: string;
    price: number;
    bookingCount: number;
  }[];
  monthlyTrend: { month: string; bookings: number }[];
}

interface PendingBooking {
  id: number;
  user_name: string;
  user_email: string;
  car_name: string;
  car_make: string;
  booking_date: string;
  time_slot: string;
}

interface PendingCar {
  id: number;
  name: string;
  make: string;
  price: number;
}

interface PendingPayload {
  totalPending?: number;
  pendingBookings: PendingBooking[];
  pendingCars: PendingCar[];
}

interface AdminBooking {
  id: number;
  // The admin bookings payload is snake_case, like user_name / car_name below.
  user_id: number;
  user_name: string;
  car_name: string;
  booking_date: string;
  status: BookingStatus;
}

const STATUS_LABELS: Record<BookingStatus, string> = {
  pending: "Pending",
  confirmed: "Confirmed",
  completed: "Completed",
  cancelled: "Cancelled",
};

// Admin routes are protected on the backend, so every request carries the
// stored session token and is resolved against VITE_API_BASE_URL.
const authToken = () => getStoredSession()?.accessToken ?? "";

async function readJson(response: Response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function formatBookingDate(value: string) {
  if (!value) return "—";

  return new Date(value).toLocaleDateString("en-UG", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

const AdminPage = () => {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [pending, setPending] = useState<PendingPayload | null>(null);
  const [bookings, setBookings] = useState<AdminBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<AdminTab>("overview");
  const [reloadToken, setReloadToken] = useState(0);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const navigate = useNavigate();
  const { logout } = useAuth();
  // The dashboard renders inside the /Admin layout, which owns the chat
  // provider, so this count stays live while the admin works the console.
  const { totalUnreadCount } = useAdminChat();

  const {
    isLoading: customersLoading,
    result: customersResult,
    refresh: refreshCustomers,
  } = useAdminCustomers();

  // One drawer serves both entry points: the customers table and the customer
  // cell in the bookings table.
  const [selectedCustomer, setSelectedCustomer] = useState<{
    id: number;
    name: string;
  } | null>(null);
  // The sheet is state-driven (no Radix trigger), so the opening control is
  // remembered here and handed to the drawer for focus restoration on close.
  const drawerTriggerRef = useRef<HTMLElement | null>(null);

  const openCustomer = useCallback(
    (customer: { id: number; name: string }, trigger: HTMLElement) => {
      drawerTriggerRef.current = trigger;
      setSelectedCustomer(customer);
    },
    [],
  );

  const fetchAllData = useCallback(async () => {
    try {
      const token = authToken();
      const [statsRes, pendingRes, bookingsRes] = await Promise.all([
        authenticatedApiRequest("/api/admin/stats", token),
        authenticatedApiRequest("/api/admin/pending-approvals", token),
        authenticatedApiRequest("/api/admin/bookings", token),
      ]);

      const [statsData, pendingData, bookingsData] = await Promise.all([
        readJson(statsRes),
        readJson(pendingRes),
        readJson(bookingsRes),
      ]);

      // This screen was written against an older /api/admin/stats contract
      // (stats.cars / stats.bookings / stats.users). Only apply a payload that
      // actually matches it instead of rendering undefined metrics.
      const rawStats = statsData?.stats;
      if (
        statsData?.success &&
        rawStats?.cars &&
        rawStats?.bookings &&
        rawStats?.users
      ) {
        setStats(rawStats);
      } else {
        setError("The admin statistics endpoint returned an unexpected payload.");
      }

      if (pendingData?.success) setPending(pendingData);
      if (bookingsData?.success) setBookings(bookingsData.data ?? []);
    } catch (requestError) {
      console.error("Error fetching admin data:", requestError);
      setError("Admin data could not be loaded. Check that the API is running.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAllData();
    // Refresh every 30 seconds so the queue stays current.
    const interval = setInterval(fetchAllData, 30000);
    return () => clearInterval(interval);
  }, [fetchAllData, reloadToken]);

  const refresh = () => setReloadToken((token) => token + 1);

  const updateBookingStatus = async (bookingId: number, status: BookingStatus) => {
    setNotice("");
    setError("");

    try {
      const response = await authenticatedApiRequest(
        `/api/admin/bookings/${bookingId}/status`,
        authToken(),
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status }),
        },
      );
      const data = await readJson(response);

      if (data?.success) {
        setNotice(`Booking #${bookingId} set to ${status}.`);
        refresh();
        return;
      }

      setError(`Booking #${bookingId} could not be updated.`);
    } catch (requestError) {
      console.error("Error updating booking:", requestError);
      setError(`Booking #${bookingId} could not be updated.`);
    }
  };

  const approveCar = async (carId: number) => {
    setNotice("");
    setError("");

    try {
      const response = await authenticatedApiRequest(
        `/api/admin/cars/${carId}/approve`,
        authToken(),
        { method: "PUT" },
      );
      const data = await readJson(response);

      if (data?.success) {
        setNotice("Listing approved and moved into available stock.");
        refresh();
        return;
      }

      setError("The listing could not be approved.");
    } catch (requestError) {
      console.error("Error approving car:", requestError);
      setError("The listing could not be approved.");
    }
  };

  const handleSignOut = () => {
    logout();
    navigate("/login", { replace: true });
  };

  const pendingCount =
    pending?.totalPending ?? pending?.pendingBookings.length ?? 0;

  const customerCount =
    customersResult && customersResult.success === true
      ? customersResult.customers.length
      : null;

  const tabs: { id: AdminTab; label: string }[] = useMemo(
    () => [
      { id: "overview", label: "Overview" },
      { id: "pending", label: `Pending approvals (${pendingCount})` },
      { id: "bookings", label: "Bookings" },
      {
        id: "customers",
        label: customerCount === null ? "Customers" : `Customers (${customerCount})`,
      },
    ],
    [customerCount, pendingCount],
  );

  if (loading) {
    return (
      <AdminShell>
        <section className="profile-heading admin-heading">
          <div>
            <h1>Admin dashboard</h1>
            <p>Inventory, bookings and customer activity for the Banda showroom.</p>
          </div>
        </section>
        <p className="admin-empty">Loading admin dashboard…</p>
      </AdminShell>
    );
  }

  const trendMax = Math.max(
    1,
    ...(stats?.monthlyTrend ?? []).map((month) => month.bookings),
  );
  const topBookings = Math.max(
    1,
    ...(stats?.popularCars ?? []).map((car) => car.bookingCount),
  );

  return (
    <AdminShell>
      <section className="profile-heading admin-heading">
        <div>
          <h1>Admin dashboard</h1>
          <p>Inventory, bookings and customer activity for the Banda showroom.</p>
        </div>

        <div className="admin-actions">
          <Link to="/admin/chat" className="secondary-button admin-action">
            <MessageSquare size={16} aria-hidden="true" />
            Customer inbox
            <UnreadChatBadge count={totalUnreadCount} />
          </Link>
          <button
            type="button"
            className="secondary-button admin-action"
            onClick={() => navigate("/")}
          >
            <ArrowLeft size={16} aria-hidden="true" />
            Back to site
          </button>
          <button
            type="button"
            className="secondary-button admin-action admin-action--signout"
            onClick={handleSignOut}
          >
            <LogOut size={16} aria-hidden="true" />
            Sign out
          </button>
        </div>
      </section>

      {notice && (
        <p className="profile-success admin-notice" role="status">
          {notice}
        </p>
      )}

      {error && (
        <p className="profile-error admin-notice" role="alert">
          {error}
        </p>
      )}

      <div className="admin-tabs" role="tablist" aria-label="Admin sections">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;

          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              id={`admin-tab-${tab.id}`}
              aria-selected={activeTab === tab.id}
              aria-controls={`admin-panel-${tab.id}`}
              className={isActive ? "admin-tab admin-tab--active" : "admin-tab"}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      <div
        className="admin-panel-stack"
        role="tabpanel"
        id={`admin-panel-${activeTab}`}
        aria-labelledby={`admin-tab-${activeTab}`}
      >
        {activeTab === "overview" && (
          <>
            {!stats ? (
              <p className="admin-empty">
                Statistics are unavailable until the admin API responds.
              </p>
            ) : (
              <>
                <section className="admin-stats" aria-label="Showroom totals">
                  <div className="admin-stat">
                    <span className="admin-stat-label">Vehicles</span>
                    <strong className="admin-stat-value">{stats.cars.total}</strong>
                  </div>
                  <div className="admin-stat">
                    <span className="admin-stat-label">Available</span>
                    <strong className="admin-stat-value">{stats.cars.available}</strong>
                  </div>
                  <div className="admin-stat">
                    <span className="admin-stat-label">Customers</span>
                    <strong className="admin-stat-value">{stats.users.total}</strong>
                  </div>
                  <div className="admin-stat">
                    <span className="admin-stat-label">Bookings</span>
                    <strong className="admin-stat-value">{stats.bookings.total}</strong>
                  </div>
                  <div className="admin-stat">
                    <span className="admin-stat-label">Pending</span>
                    <strong className="admin-stat-value">{stats.bookings.pending}</strong>
                  </div>
                  <div className="admin-stat">
                    <span className="admin-stat-label">Confirmed</span>
                    <strong className="admin-stat-value">{stats.bookings.confirmed}</strong>
                  </div>
                  <div className="admin-stat">
                    <span className="admin-stat-label">Completed</span>
                    <strong className="admin-stat-value">{stats.bookings.completed}</strong>
                  </div>
                  <div className="admin-stat">
                    <span className="admin-stat-label">Revenue this month</span>
                    <strong className="admin-stat-value admin-stat-value--wide">
                      {stats.revenue?.available ? formatUGX(stats.revenue.monthly) : "—"}
                    </strong>
                  </div>
                </section>

                <div className="admin-grid">
                  <section className="admin-panel">
                    <header className="admin-panel-head">
                      <h2>Most booked cars</h2>
                      <span className="admin-muted">
                        {stats.popularCars.length} models booked
                      </span>
                    </header>

                    <div className="admin-table-scroll">
                      <table className="admin-table">
                        <thead>
                          <tr>
                            <th scope="col">Vehicle</th>
                            <th scope="col">Make</th>
                            <th scope="col" className="admin-cell--right">
                              Price
                            </th>
                            <th scope="col" className="admin-cell--right">
                              Bookings
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {stats.popularCars.map((car) => (
                            <tr key={car.id}>
                              <td>{car.name}</td>
                              <td className="admin-cell--muted">{car.make}</td>
                              <td className="admin-cell--right">{formatUGX(car.price)}</td>
                              <td className="admin-cell--right">
                                <span className="admin-count">
                                  <span
                                    className="admin-count-fill"
                                    style={{
                                      width: `${Math.round((car.bookingCount / topBookings) * 100)}%`,
                                    }}
                                  />
                                  <span className="admin-count-value">{car.bookingCount}</span>
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>

                  <section className="admin-panel">
                    <header className="admin-panel-head">
                      <h2>Bookings, last 6 months</h2>
                      <span className="admin-muted">{trendMax} in the best month</span>
                    </header>

                    <div className="admin-trend" role="img" aria-label="Bookings per month for the last six months">
                      {stats.monthlyTrend.map((month) => (
                        <div key={month.month} className="admin-trend-column">
                          <span className="admin-trend-value">{month.bookings}</span>
                          <span
                            className="admin-trend-fill"
                            style={{
                              height: `${Math.max(6, (month.bookings / trendMax) * 100)}%`,
                            }}
                          />
                          <span className="admin-trend-label">{month.month}</span>
                        </div>
                      ))}
                    </div>
                  </section>
                </div>
              </>
            )}
          </>
        )}

        {activeTab === "pending" && (
          <>
            {!pending ? (
              <p className="admin-empty">Pending approvals could not be loaded.</p>
            ) : (
              <>
                <section className="admin-panel">
                  <header className="admin-panel-head">
                    <h2>Booking approvals</h2>
                    <span className="admin-muted">
                      {pending.pendingBookings.length} waiting
                    </span>
                  </header>

                  {pending.pendingBookings.length === 0 ? (
                    <p className="admin-empty">No bookings are waiting for approval.</p>
                  ) : (
                    <div className="admin-table-scroll">
                      <table className="admin-table">
                        <thead>
                          <tr>
                            <th scope="col">Customer</th>
                            <th scope="col">Vehicle</th>
                            <th scope="col">Date</th>
                            <th scope="col">Time</th>
                            <th scope="col" className="admin-cell--right">
                              Action
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {pending.pendingBookings.map((booking) => (
                            <tr key={booking.id}>
                              <td>
                                <span className="admin-cell-stack">
                                  <strong>{booking.user_name}</strong>
                                  <span className="admin-cell--muted">{booking.user_email}</span>
                                </span>
                              </td>
                              <td>
                                {booking.car_name}
                                <span className="admin-cell--muted"> · {booking.car_make}</span>
                              </td>
                              <td>{formatBookingDate(booking.booking_date)}</td>
                              <td>{booking.time_slot}</td>
                              <td className="admin-cell--right">
                                <span className="admin-row-actions">
                                  <button
                                    type="button"
                                    className="admin-button admin-button--primary"
                                    onClick={() =>
                                      updateBookingStatus(booking.id, "confirmed")
                                    }
                                  >
                                    Confirm
                                  </button>
                                  <button
                                    type="button"
                                    className="admin-button admin-button--danger"
                                    onClick={() =>
                                      updateBookingStatus(booking.id, "cancelled")
                                    }
                                  >
                                    Cancel
                                  </button>
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>

                <section className="admin-panel">
                  <header className="admin-panel-head">
                    <h2>Listing approvals</h2>
                    <span className="admin-muted">{pending.pendingCars.length} waiting</span>
                  </header>

                  {pending.pendingCars.length === 0 ? (
                    <p className="admin-empty">No listings are waiting for approval.</p>
                  ) : (
                    <div className="admin-table-scroll">
                      <table className="admin-table">
                        <thead>
                          <tr>
                            <th scope="col">Vehicle</th>
                            <th scope="col">Make</th>
                            <th scope="col">Price</th>
                            <th scope="col" className="admin-cell--right">
                              Action
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {pending.pendingCars.map((car) => (
                            <tr key={car.id}>
                              <td>{car.name}</td>
                              <td className="admin-cell--muted">{car.make}</td>
                              <td>{formatUGX(car.price)}</td>
                              <td className="admin-cell--right">
                                <button
                                  type="button"
                                  className="admin-button admin-button--primary"
                                  onClick={() => approveCar(car.id)}
                                >
                                  Approve
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>
              </>
            )}
          </>
        )}

        {activeTab === "bookings" && (
          <section className="admin-panel">
            <header className="admin-panel-head">
              <h2>All bookings</h2>
              <span className="admin-muted">{bookings.length} records</span>
            </header>

            {bookings.length === 0 ? (
              <p className="admin-empty">No bookings have been recorded yet.</p>
            ) : (
              <div className="admin-table-scroll">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th scope="col">Ref</th>
                      <th scope="col">Customer</th>
                      <th scope="col">Vehicle</th>
                      <th scope="col">Date</th>
                      <th scope="col">Status</th>
                      <th scope="col" className="admin-cell--right">
                        Update
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {bookings.map((booking) => (
                      <tr key={booking.id}>
                        <td className="admin-cell--muted">#{booking.id}</td>
                        <td>
                          <button
                            type="button"
                            className="admin-link-button"
                            onClick={(event) =>
                              openCustomer(
                                { id: booking.user_id, name: booking.user_name },
                                event.currentTarget,
                              )
                            }
                            aria-label={`View booking history for ${booking.user_name}`}
                          >
                            {booking.user_name}
                          </button>
                        </td>
                        <td>{booking.car_name}</td>
                        <td>{formatBookingDate(booking.booking_date)}</td>
                        <td>
                          <span className={`admin-status admin-status--${booking.status}`}>
                            <span className="admin-status-mark" aria-hidden="true" />
                            {STATUS_LABELS[booking.status]}
                          </span>
                        </td>
                        <td className="admin-cell--right">
                          <label className="admin-visually-hidden" htmlFor={`booking-status-${booking.id}`}>
                            Status for booking #{booking.id}
                          </label>
                          <select
                            id={`booking-status-${booking.id}`}
                            className="admin-select"
                            value={booking.status}
                            onChange={(event) =>
                              updateBookingStatus(
                                booking.id,
                                event.target.value as BookingStatus,
                              )
                            }
                          >
                            <option value="pending">Pending</option>
                            <option value="confirmed">Confirmed</option>
                            <option value="completed">Completed</option>
                            <option value="cancelled">Cancelled</option>
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {activeTab === "customers" && (
          <CustomersPanel
            isLoading={customersLoading}
            result={customersResult}
            onRefresh={() => void refreshCustomers()}
            onOpenCustomer={openCustomer}
          />
        )}
      </div>

      <CustomerBookingsDrawer
        customerId={selectedCustomer?.id ?? null}
        customerName={selectedCustomer?.name}
        returnFocusTo={drawerTriggerRef.current}
        onClose={() => setSelectedCustomer(null)}
        onShowAllBookings={() => {
          setSelectedCustomer(null);
          setActiveTab("bookings");
        }}
      />
    </AdminShell>
  );
};

export default AdminPage;
