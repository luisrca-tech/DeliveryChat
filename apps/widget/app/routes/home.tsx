import { Welcome } from "../welcome/welcome";
import { ChatWidgetEmbed } from "../components/ChatWidgetEmbed";
import type { Route } from "./+types/home";

export function meta(_args: Route.MetaArgs) {
  return [
    { title: "Delivery Chat Widget" },
    { name: "description", content: "Chat widget preview" },
  ];
}

export default function Home() {
  return (
    <>
      <Welcome />
      <ChatWidgetEmbed />
    </>
  );
}
