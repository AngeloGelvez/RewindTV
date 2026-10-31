/** Canal del modo en vivo. */
import { intern } from '../../patterns/flyweight.js';

export function createChannel(raw) {
  return {
    id: raw.id,
    name: raw.name,
    number: raw.number,
    logo: raw.logo,
    category: intern(raw.category),
    stream: raw.stream,
  };
}
