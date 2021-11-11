#define HEROI '@'
#define FANTASMA 'F'
#define VAZIO '.'
#define PAREDE_VERTICAL '|'
#define PAREDE_HORIZONTAL '-'

struct mapa {
    char** matriz;
    int linhas;
    int colunas; 
};

typedef struct mapa MAPA; //um tipo de apelido foi definido para a struct do tipo mapa, com o nome de MAPA ele torna mais f�cil a defini��o de ma nova struct tipo map

struct posicao {
    int x;
    int y;
};

typedef struct posicao POSICAO;

int liberamapa(MAPA* m);
int lemapa(MAPA* m);
int alocamapa(MAPA* m);
void imprimemapa(MAPA* m);
void encontramapa(MAPA* m, POSICAO* p, char c);
int ehvalida(MAPA* m, int x, int y);
int ehVazia(MAPA* m, int x, int y);
void andanomapa(MAPA* m, int xorigem, int yorigem, int xdestino, int ydestino);
void copiamapa(MAPA* destino, MAPA* origem);


