export const log = (message) => {
  const formatted =
    message instanceof Error
      ? message.stack || message.message
      : typeof message === 'object' && message !== null
        ? JSON.stringify(message)
        : message;
  console.log(`${new Date().toISOString()}: ${formatted}`);
};
