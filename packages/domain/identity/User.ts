import { UserId } from "@snaveevans/pineapple-shared";

export default class User {
  private constructor(
    readonly id: UserId,
    public name: string,
  ) {}

  static create(props: { name: string }): User {
    if (!props.name.trim()) {
      throw new Error("User name is required");
    }
    return new User(UserId.generate(), props.name.trim());
  }
}
