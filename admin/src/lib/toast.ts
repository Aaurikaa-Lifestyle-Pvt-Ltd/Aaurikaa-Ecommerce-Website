/**
 * AAURIKAA Admin global toast API.
 *
 * @example
 * toast.success("Product saved successfully");
 * toast.error("Unable to save product");
 * toast.warning("Some products require review");
 * toast.info("Import processing has started");
 * toast({ type: "success", message: "…", duration: 4000 });
 */

export {
  toast,
  pushToast,
  dismissToast,
  clearToasts,
  getToasts,
  subscribeToasts,
  TOAST_DURATIONS,
  TOAST_MAX_VISIBLE,
  type ToastType,
  type ToastInput,
  type ToastItem,
} from "@/lib/toast-store";

export { toastMessageFromUnknown } from "@/lib/toast-message";
