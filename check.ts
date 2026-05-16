import { localUsersService } from './server/localUsersService.js';

async function main() {
  const total = await localUsersService.count();
  console.log('Usuários cadastrados:', total);
  if (total > 0) {
    const users = await localUsersService.listAll();
    users.forEach(u => console.log('Email:', u.email, '| Admin:', u.is_admin));
  }
}

main();
