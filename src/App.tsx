import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useEffect } from 'react';
import { useAuthStore } from '@/store/useAuthStore';
import Login from '@/pages/Login';
import Dashboard from '@/pages/Dashboard';
import Technicians from '@/pages/Technicians';
import Schedule from '@/pages/Schedule';
import Orders from '@/pages/Orders';
import CreateOrder from '@/pages/CreateOrder';
import OrderDetail from '@/pages/OrderDetail';
import Approvals from '@/pages/Approvals';
import Reports from '@/pages/Reports';
import ConflictCenter from '@/pages/ConflictCenter';

function App() {
  const { checkAuth } = useAuthStore();

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  return (
    <Router>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/technicians" element={<Technicians />} />
        <Route path="/schedule" element={<Schedule />} />
        <Route path="/orders" element={<Orders />} />
        <Route path="/orders/new" element={<CreateOrder />} />
        <Route path="/orders/:id" element={<OrderDetail />} />
        <Route path="/approvals" element={<Approvals />} />
        <Route path="/conflicts" element={<ConflictCenter />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </Router>
  );
}

export default App;
