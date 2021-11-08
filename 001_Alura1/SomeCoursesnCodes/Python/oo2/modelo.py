class ProgramaDeTv:
    def __init__(self, nome, ano):
        self._nome = nome.title() #maiúsculas nas primeiras letras das palavras #capitalize() somente maiuscula primeira letra da primeira palavra
        self.ano = ano
        self._likes = 0

    @property
    def likes(self):
        return self._likes

    def dar_likes(self):
        self._likes += 1

    @property
    def nome(self):
        return self._nome

    @nome.setter
    def nome(self, novo_nome):
        self._nome = novo_nome.title()

    @property
    def likes(self):
        return self._likes

    def __str__(self):
        return f'{self._nome} - {self.ano} - {self._likes} Likes'


class Filme(ProgramaDeTv): #herança da classe mãe
    def __init__(self, nome, ano, duracao):
        super().__init__(nome, ano) #chama o inicializador construtor da classe mãe
        self.duracao = duracao

    def __str__(self):
        return f'{self._nome} - {self.ano} - {self.duracao} Minutos - {self._likes} Likes '

class Serie(ProgramaDeTv):
    def __init__(self, nome, ano, temporadas):
        super().__init__(nome, ano)
        self.temporadas = temporadas

    def __str__(self):
        return f'{self._nome} - {self.ano} - {self.temporadas} Temporadas - {self._likes} Likes '

# class PlayList(list): não vai mais herdar tudo de list
class PlayList():
    def __init__(self, nome, programas):
        self.nome = nome
        self._programas = programas
        #super().__init__(programas) #chamando o construtor de list e passando a lista de programas para ele

    def __getitem__(self, item):
        return self._programas[item] #retorna a lista para a classe tornando a classe iterável

    @property
    def listagem(self):
        return self._programas

    def __len__(self):
        return len(self._programas) #retorna e utiliza o método len para tornar o objeto sizeable

vingadores = Filme('vingadores - guerra infinita', 2018, 160)
atlanta = Serie('atlanta', 2018, 2)
grito = Filme('grito', 2000, 120)
demolidor = Serie('demolidor', 2016, 2)

vingadores.dar_likes()
vingadores.dar_likes()

grito.dar_likes()
grito.dar_likes()

atlanta.dar_likes()
atlanta.dar_likes()

demolidor.dar_likes()
demolidor.dar_likes()

print(f'Nome: {vingadores.nome} - Likes: {vingadores.likes}')
print(f'Nome: {atlanta.nome} - Likes: {atlanta.likes}')

filmes_e_series = [vingadores, atlanta, grito, demolidor]
playlist_fim_de_semana = PlayList('Fim de Semana', filmes_e_series)

for programa in playlist_fim_de_semana:
    print(programa)

print(len(playlist_fim_de_semana))

print(demolidor in playlist_fim_de_semana)
