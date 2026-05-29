import { UserId, type Email } from "@snaveevans/pineapple-shared";

export class User {
  private constructor(
    readonly id: UserId,
    readonly email: Email,
    readonly createdAt: Date,
  ) {}

  static create(email: Email): User {
    return new User(UserId.generate(), email, new Date());
  }

  static reconstitute(props: { id: UserId; email: Email; createdAt: Date }): User {
    return new User(props.id, props.email, props.createdAt);
  }
}
