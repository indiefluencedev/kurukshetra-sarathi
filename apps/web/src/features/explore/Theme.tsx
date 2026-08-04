import { useParams } from "react-router-dom";
import { theme } from "@/data/config";
import { Explore } from "./Explore";

/**
 * One interest group's places.
 *
 * It is Explore with a theme already chosen — the same list, the same chips,
 * the same search box, the same plus on every card. It used to be its own
 * screen with its own copy of the list and its own "plan a day around this"
 * button, which meant a fix to one never reached the other.
 *
 * An unknown theme, or one this scope cannot fill, lands on Explore unfiltered
 * rather than on an empty page: Nature has one place in Pehowa and two in
 * Kurukshetra, so a theme that exists in one town may not in the other, and
 * switching town with a theme open must not strand anyone.
 */
export function Theme() {
  const { id = "" } = useParams();
  return <Explore theme={theme(id) ? id : undefined} />;
}
