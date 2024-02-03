# Contributing to Qdrant-operator

If you would like to contribute code you can do so through GitHub by forking the repository and sending a pull request. Create a new branch for your changes. 
When submitting code, please make every effort to follow existing conventions and style in order to keep the code as readable as possible.

## What do you need to know to help?

If you want to help out with a code contribution, this project uses the following stack:

- [Node.JS](https://nodejs.org/) - 18.x
- [AVA](https://github.com/avajs/ava) (for testing)
- [Prettier](https://github.com/prettier/prettier) (for linting)
- [Kubernetes](https://docs.nestjs.com/fundamentals/testing) - 1.26+

You can install Kubernetes for local development using any of the following solutions:

- [k3s](https://github.com/k3s-io/k3s)
- [kind](https://github.com/kubernetes-sigs/kind)
- [minikube](https://github.com/kubernetes/minikube)

## Submitting a PR

- For every PR there should be an accompanying issue which the PR solves
- The PR itself should only contain code which is the solution for the given issue
- Run `npm run test` and `npm run lint:check` before submitting a PR

## License

By contributing your code, you agree to license your contribution under the terms of the [MIT](./LICENSE) license.
All files are released with the MIT license.

## Code of conduct

Please note that this project is released with a Contributor Code of Conduct. By participating in this project you agree to abide by its terms.

[Code of Conduct](./CODE_OF_CONDUCT.md)

