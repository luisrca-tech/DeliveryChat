import { Navbar } from "nextra-theme-docs";

export function DocsNavbar() {
  return (
    <Navbar
      logo={
        <span className="font-bold text-lg bg-linear-to-r from-primary to-primary-glow bg-clip-text text-transparent">
          Delivery Chat
        </span>
      }
      projectLink="https://github.com/luisrca-tech/DeliveryChat"
    />
  );
}
