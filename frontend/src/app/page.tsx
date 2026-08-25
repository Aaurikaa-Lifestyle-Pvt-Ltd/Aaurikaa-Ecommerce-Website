import { HomepageSections } from "@/components/home";

/** Homepage merchandising/catalogue sections read the API when configured. */
export const dynamic = "force-dynamic";

/**
 * Homepage — composed from the locked, config-driven section order
 * (see `@/config/homepage` and ECOMMERCE_DEMO_MASTER_BRIEF.md §10).
 *
 * Implemented sections render via `HomepageSections`; remaining locked
 * sections are added in later waves without changing this page shell.
 */
export default function Home() {
  return <HomepageSections />;
}
