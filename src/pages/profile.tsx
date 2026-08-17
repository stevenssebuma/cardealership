import { useEffect, useState } from "react";
// @ts-ignore: Allow side-effect CSS import without type declarations
import "./Profile.css";

interface User {
  id?: number;
  name?: string;
  email?: string;
  role?: string;
  registrationDate?: string;
  created_at?: string;
  createdAt?: string;
}

export default function Profile() {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const storedUser = localStorage.getItem("user");

    if (storedUser) {
      try {
        setUser(JSON.parse(storedUser));
      } catch (error) {
        console.error("Could not read user information:", error);
      }
    }
  }, []);

  if (!user) {
    return (
      <div className="profile-page">
        <h1>My Profile</h1>
        <p>No user information found. Please log in.</p>
      </div>
    );
  }

  const registrationDate =
    user.registrationDate ||
    user.created_at ||
    user.createdAt;

  return (
    <div className="profile-page">
      <div className="profile-card">
        <h1>My Profile</h1>

        <div className="profile-section">
          <label>Name</label>
          <p>{user.name || "Not provided"}</p>
        </div>

        <div className="profile-section">
          <label>Email</label>
          <p>{user.email || "Not provided"}</p>
        </div>

        <div className="profile-section">
          <label>Registration Date</label>
          <p>
            {registrationDate
              ? new Date(registrationDate).toLocaleDateString()
              : "Not available"}
          </p>
        </div>

        <div className="profile-section">
          <label>Account Type</label>
          <p>{user.role || "user"}</p>
        </div>
      </div>
    </div>
  );
}