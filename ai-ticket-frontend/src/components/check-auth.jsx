import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

function CheckAuth({ children, protectedRoute }) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("token");

    // Protected routes: must be logged in
    if (protectedRoute) {
      if (!token) {
        navigate("/login", { replace: true });
      } else {
        setLoading(false);
      }
    } else {
      // Public routes: if already logged in, send to home
      if (token) {
        navigate("/", { replace: true });
      } else {
        setLoading(false);
      }
    }
  }, [navigate, protectedRoute]);

  if (loading) {
    return <div className="text-center mt-10">loading...</div>;
  }

  return children;
}

export default CheckAuth;
