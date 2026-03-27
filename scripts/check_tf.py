import importlib
spec = importlib.util.find_spec('tensorflow')
print('tensorflow_available:', spec is not None)
