import { cookies } from "next/headers";
import { EDITION_COOKIE, parseEdition } from "./edition";

export async function readEdition() {
  return parseEdition((await cookies()).get(EDITION_COOKIE)?.value);
}
