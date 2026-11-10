import { Navigate, Route, Routes } from "react-router-dom";
import StoreLayout from "./components/StoreLayout";
import AdminLayout from "./pages/admin/AdminLayout";
import Categories from "./pages/admin/Categories";
import AdminClipart from "./pages/admin/Clipart";
import Coupons from "./pages/admin/Coupons";
import Customers from "./pages/admin/Customers";
import Dashboard from "./pages/admin/Dashboard";
import AdminOrderDetail from "./pages/admin/OrderDetail";
import AdminOrders from "./pages/admin/Orders";
import ProductEditor from "./pages/admin/ProductEditor";
import AdminProducts from "./pages/admin/Products";
import Settings from "./pages/admin/Settings";
import { AccountLayout, Addresses, MyOrderDetail, MyOrders, Profile, Wishlist } from "./pages/store/Account";
import { Login, Register } from "./pages/store/Auth";
import Cart from "./pages/store/Cart";
import Checkout from "./pages/store/Checkout";
import Customize from "./pages/store/Customize";
import Home from "./pages/store/Home";
import InfoPage, { NotFound } from "./pages/store/Info";
import OrderStatus from "./pages/store/OrderStatus";
import Product from "./pages/store/Product";
import MyDesigns from "./pages/store/MyDesigns";
import Redesign from "./pages/store/Redesign";
import Shop from "./pages/store/Shop";

export default function App() {
  return (
    <Routes>
      <Route element={<StoreLayout />}>
        <Route index element={<Home />} />
        <Route path="shop" element={<Shop />} />
        <Route path="category/:slug" element={<Shop />} />
        <Route path="product/:slug" element={<Product />} />
        <Route path="cart" element={<Cart />} />
        <Route path="checkout" element={<Checkout />} />
        <Route path="customize" element={<Customize />} />
        <Route path="redesign/:number" element={<Redesign />} />
        <Route path="order/:number/status" element={<OrderStatus />} />
        <Route path="login" element={<Login />} />
        <Route path="register" element={<Register />} />
        <Route path="account" element={<AccountLayout />}>
          <Route index element={<Navigate to="orders" replace />} />
          <Route path="orders" element={<MyOrders />} />
          <Route path="orders/:number" element={<MyOrderDetail />} />
          <Route path="addresses" element={<Addresses />} />
          <Route path="designs" element={<MyDesigns />} />
          <Route path="wishlist" element={<Wishlist />} />
          <Route path="profile" element={<Profile />} />
        </Route>
        <Route path="about" element={<InfoPage page="about" />} />
        <Route path="contact" element={<InfoPage page="contact" />} />
        <Route path="shipping-policy" element={<InfoPage page="shipping" />} />
        <Route path="refund-policy" element={<InfoPage page="refund" />} />
        <Route path="terms" element={<InfoPage page="terms" />} />
        <Route path="privacy" element={<InfoPage page="privacy" />} />
        <Route path="*" element={<NotFound />} />
      </Route>

      <Route path="admin" element={<AdminLayout />}>
        <Route index element={<Dashboard />} />
        <Route path="orders" element={<AdminOrders key="standard" kind="STANDARD" />} />
        <Route path="custom-orders" element={<AdminOrders key="custom" kind="CUSTOM" />} />
        <Route path="orders/:number" element={<AdminOrderDetail />} />
        <Route path="products" element={<AdminProducts />} />
        <Route path="products/new" element={<ProductEditor />} />
        <Route path="products/:id" element={<ProductEditor />} />
        <Route path="categories" element={<Categories />} />
        <Route path="customers" element={<Customers />} />
        <Route path="coupons" element={<Coupons />} />
        <Route path="clipart" element={<AdminClipart />} />
        <Route path="settings" element={<Settings />} />
      </Route>
    </Routes>
  );
}
