import type { AdminCustomer } from "@/types/admin";

export const customers: AdminCustomer[] = [
  {
    id: "c-anya",
    name: "Anya Mehta",
    email: "anya.mehta@example.com",
    phone: "+91 98765 43210",
    ordersCount: 4,
    totalSpent: 8746,
    joinedAt: "2025-11-12",
    city: "Mumbai",
  },
  {
    id: "c-riya",
    name: "Riya Kapoor",
    email: "riya.kapoor@example.com",
    phone: "+91 98111 22334",
    ordersCount: 2,
    totalSpent: 3498,
    joinedAt: "2026-01-08",
    city: "Delhi",
  },
  {
    id: "c-sara",
    name: "Sara Iqbal",
    email: "sara.iqbal@example.com",
    phone: "+91 99220 11887",
    ordersCount: 3,
    totalSpent: 5697,
    joinedAt: "2025-09-22",
    city: "Hyderabad",
  },
  {
    id: "c-meera",
    name: "Meera Nair",
    email: "meera.nair@example.com",
    phone: "+91 97654 00112",
    ordersCount: 1,
    totalSpent: 2299,
    joinedAt: "2026-02-18",
    city: "Bengaluru",
  },
  {
    id: "c-priya",
    name: "Priya Desai",
    email: "priya.desai@example.com",
    phone: "+91 98887 66554",
    ordersCount: 5,
    totalSpent: 11245,
    joinedAt: "2025-07-03",
    city: "Pune",
  },
  {
    id: "c-isha",
    name: "Isha Verma",
    email: "isha.verma@example.com",
    phone: "+91 99001 33445",
    ordersCount: 2,
    totalSpent: 2898,
    joinedAt: "2026-03-01",
    city: "Jaipur",
  },
];

export function getCustomer(id: string) {
  return customers.find((c) => c.id === id);
}
