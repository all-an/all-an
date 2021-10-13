#include <stdlib.h>
#include <stdio.h>
#include <locale.h>

int a, b, c;

void adicionapalavra() {
    char quer;

    printf("Quer salvar o jogo (DIGITE: S para Sim / N para Não)?");
    scanf(" %c", &quer);

    if(quer == 'S') {
        char novapalavra;

        printf("Digite a nova palavra, em letras mai?sculas: ");
        scanf("%s", novapalavra);

        FILE* f;

        f = fopen("palavras.txt", "r+");
        if(f == 0) {
            printf("Banco de dados de palavras n?o dispon?vel\n\n");
            exit(1);
        }

        int qtd;
        fscanf(f, "%d", &qtd);
        qtd++;
        fseek(f, 0, SEEK_SET);
        fprintf(f, "%d", qtd);

        fseek(f, 0, SEEK_END);
        fprintf(f, "\n%s", novapalavra);

        fclose(f);

    }

}

int main(){
	setlocale(LC_ALL, "Portuguese");
	
	FILE *SaveFile;
    char FileName[] = "i.txt";
    
    SaveFile = fopen (FileName, "wb");// opens file for writing and in binary mode

    fclose (SaveFile);
	
	printf("Depois de uma vida inteira de luta por este mundo é aqui que você se encontra...\n");
	printf("Com esses bastardos que você chama de amigos e na frente deste castelo\n");
	printf("1) Para entrar no Castelo: \n2) Para contornar o castelo: \nDigite a opção: ");
	scanf("%d",&a);
	/*printf();
	switch (b)
	{
	   case constante1:
	     Instruções;
	   break;
	
	   case constante2:
	     Instruções;
	   break;
	
	   default:
	     Instruções;
	}*/
	
	
    
	getch();
		
}
