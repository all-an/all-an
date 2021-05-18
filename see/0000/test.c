#include <stdio.h>

//  ==========                 ==========
//  ========== 	     game	   ==========
//  ==========                 ==========

int main(){
    int numerosecreto = 42;
    printf("Hello world\n");

    int chute;

    printf("Qual é o seu chute? ");
    scanf("%d", &chute);
    printf("Seu chute foi %d\n", chute);

	int acertou = (chute == numerosecreto);

	printf("Acertou: %d\n", acertou);

	if(acertou){
		printf("Você acertou!\n");
		printf("Denovo, você joga bem!\n");
	}
	else{
		if(chute > numerosecreto){
			printf("Chute maior.\n");
		}else if(chute < numerosecreto){
			printf("Chute menor.\n");	
		}
		printf("Você errou!\n");	
	} 

}
