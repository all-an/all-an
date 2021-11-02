
class Cliente:
    def __init__(self, nome): #construtor
        self.__nome = nome #atributo

    #getter
    @property #propriedade chamada automaticamente ao chamar o construtor
    def nome(self):
        print("Chamando propriedade nome()")
        return self.__nome.title()

    #setter
    @nome.setter
    def nome(self, nome):
        print("Chamando o Setter propriedade")
        self.__nome = nome