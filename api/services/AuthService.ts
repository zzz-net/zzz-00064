import bcrypt from 'bcryptjs';
import { query, run, getLastInsertId } from '../db/index.js';
import { User } from '../../shared/types.js';

export class AuthService {
  static async login(username: string, password: string): Promise<User | null> {
    const users = query<User & { password_hash: string }>(
      'SELECT * FROM users WHERE username = ?',
      [username]
    );

    if (users.length === 0) return null;

    const user = users[0];
    const isValid = bcrypt.compareSync(password, user.password_hash);

    if (!isValid) return null;

    const { password_hash, ...userWithoutPassword } = user;
    return userWithoutPassword as User;
  }

  static getUserById(id: number): User | null {
    const users = query<User>('SELECT id, username, name, role, created_at FROM users WHERE id = ?', [id]);
    return users.length > 0 ? users[0] : null;
  }

  static getAllUsers(): User[] {
    return query<User>('SELECT id, username, name, role, created_at FROM users');
  }
}
